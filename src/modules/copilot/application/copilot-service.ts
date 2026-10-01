import type { ReportContent } from "@/modules/reports";
import type { BodyPart, Modality, PatientSex } from "@/modules/studies";
import { ALL_RULES } from "../domain/rules";
import { applyFix } from "../domain/apply-fix";
import type { CopilotIssue, CopilotIssueDraft, IssueSource, RuleContext, SuggestedFix } from "../domain/issue";
import type { CopilotReviewer } from "../domain/reviewer";

/**
 * Persistence port CopilotService depends on. The Supabase implementation
 * (infrastructure/copilot-repository.ts) replaces open issues on every run
 * (delete open issues for the report, insert the fresh set) and keeps
 * resolved issues as history, matching the RLS policies on copilot_issues
 * (`copilot_issues: delete open issues`).
 */
export interface CopilotIssueRepository {
  listOpenIssues(reportId: string): Promise<CopilotIssue[]>;
  /** Issues already fixed, dismissed or acknowledged for the report (kept as history). */
  listResolvedIssues(reportId: string): Promise<CopilotIssue[]>;
  /**
   * Deletes the report's unresolved issues from `sources`, then inserts
   * `drafts`. Returns every issue of the report (open and resolved).
   */
  replaceOpenIssues(reportId: string, drafts: CopilotIssueDraft[], sources: readonly IssueSource[]): Promise<CopilotIssue[]>;
  resolveIssue(issueId: string, resolvedBy: string): Promise<void>;
}

/** Minimal audit port (see src/modules/audit). CopilotService never writes audit_events directly. */
export interface AuditRecorder {
  record(event: {
    actorId: string | null;
    entity: "copilot_issue" | "report";
    entityId: string;
    action: "copilot_issue.resolved" | "report.saved";
    payload: Record<string, unknown>;
  }): Promise<void>;
}

export interface RunCopilotInput {
  reportId: string;
  content: ReportContent;
  study: { modality: Modality; bodyPart: BodyPart; indication: string };
  patient: { sex: PatientSex; ageYears: number };
}

export interface RunCopilotOptions {
  /**
   * Also run the LLM review (default true). The reading room passes false for
   * the run after each edit and true when the radiologist asks for a review,
   * so a model call is not made on every keystroke; open LLM issues from the
   * last review are kept across rules-only runs.
   */
  review?: boolean;
}

export interface RunCopilotResult {
  issues: CopilotIssue[];
  /** True if any open issue is severity "blocking" (signing should be blocked). */
  hasBlockingOpen: boolean;
}

export class CopilotService {
  constructor(
    private readonly issues: CopilotIssueRepository,
    private readonly reviewer: CopilotReviewer,
    private readonly audit: AuditRecorder,
  ) {}

  /**
   * Runs the deterministic rules and the LLM reviewer over the given report
   * content, then replaces the report's open issues with the fresh result
   * (resolved issues are untouched: they remain as history).
   */
  async run(input: RunCopilotInput, { review = true }: RunCopilotOptions = {}): Promise<RunCopilotResult> {
    const ruleContext: RuleContext = { content: input.content, study: input.study, patient: input.patient };

    const ruleDrafts = ALL_RULES.flatMap((rule) => rule.run(ruleContext));
    const llmDrafts = review
      ? await this.reviewer.reviewReport({ content: input.content, study: input.study, patient: input.patient })
      : [];

    // An issue the radiologist already dismissed or acknowledged stays settled:
    // re-running the rules on the next edit must not raise it again.
    const settled = new Set((await this.issues.listResolvedIssues(input.reportId)).map(issueKey));
    const drafts = [...ruleDrafts, ...llmDrafts].filter((draft) => !settled.has(issueKey(draft)));
    const issues = await this.issues.replaceOpenIssues(
      input.reportId,
      drafts,
      review ? ["rule", "guideline", "llm"] : ["rule", "guideline"],
    );

    return { issues, hasBlockingOpen: issues.some((i) => i.severity === "blocking" && !i.resolved) };
  }

  /** Applies a suggested fix to content, then marks the issue resolved. Returns the new content. */
  async applyAndResolve(
    issue: Pick<CopilotIssue, "id">,
    fix: SuggestedFix,
    content: ReportContent,
    resolvedBy: string,
  ): Promise<ReportContent> {
    const nextContent = applyFix(content, fix);
    await this.resolve(issue, resolvedBy);
    return nextContent;
  }

  /** Dismisses a non-blocking issue without applying a fix (blocking issues must be fixed, not dismissed). */
  async dismiss(issue: Pick<CopilotIssue, "id" | "severity">, resolvedBy: string): Promise<void> {
    if (issue.severity === "blocking") {
      throw new Error("Blocking issues cannot be dismissed; apply the fix or address the finding first.");
    }
    await this.resolve(issue, resolvedBy);
  }

  /**
   * Acknowledges a blocking issue that has no fix to apply (a critical finding:
   * the radiologist confirms it was communicated). Resolves it so signing can proceed.
   */
  async acknowledge(issue: Pick<CopilotIssue, "id" | "severity">, resolvedBy: string): Promise<void> {
    if (issue.severity !== "blocking") {
      throw new Error("Only blocking issues are acknowledged; dismiss this one instead.");
    }
    await this.resolve(issue, resolvedBy);
  }

  private async resolve(issue: Pick<CopilotIssue, "id">, resolvedBy: string): Promise<void> {
    await this.issues.resolveIssue(issue.id, resolvedBy);
    await this.audit.record({
      actorId: resolvedBy,
      entity: "copilot_issue",
      entityId: issue.id,
      action: "copilot_issue.resolved",
      payload: {},
    });
  }
}

function issueKey(issue: Pick<CopilotIssueDraft, "ruleId" | "message">): string {
  return `${issue.ruleId}|${issue.message}`;
}
