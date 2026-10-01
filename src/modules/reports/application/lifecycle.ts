import { isBlockingOpen, type CopilotIssue } from "@/modules/copilot";
import type { Template } from "@/modules/templates";
import { missingRequiredSections, pendingAiSections, type ReportContent } from "../domain/content";
import type { Report, ReportVersion } from "../domain/report";
import { nextStatus, type ReportStatus } from "../domain/status";

/**
 * Friendly, app-level gate in front of the DB trigger (reports_before_update
 * in supabase/migrations/20261001000000_init_schema.sql), which enforces the
 * same invariants as the last line of defense. Checking here first lets the
 * UI show a specific, actionable message instead of a raw Postgres error.
 */

export type SignBlockReason =
  | { kind: "missing_sections"; sections: string[] }
  | { kind: "pending_ai_sections"; sections: string[] }
  | { kind: "open_blocking_issues"; issues: CopilotIssue[] }
  | { kind: "invalid_transition"; from: ReportStatus };

export interface SignGateResult {
  ok: boolean;
  reasons: SignBlockReason[];
}

/** Pure: everything `signReport` needs to check before it attempts the DB update. */
export function evaluateSignGate(
  report: Pick<Report, "status">,
  content: ReportContent,
  template: Pick<Template, "sections">,
  openIssues: Pick<CopilotIssue, "severity" | "resolved">[],
): SignGateResult {
  const reasons: SignBlockReason[] = [];

  if (nextStatus(report.status, "sign") === null) {
    reasons.push({ kind: "invalid_transition", from: report.status });
  }

  const missing = missingRequiredSections(content, template);
  if (missing.length > 0) {
    reasons.push({ kind: "missing_sections", sections: missing });
  }

  const pending = pendingAiSections(content);
  if (pending.length > 0) {
    reasons.push({ kind: "pending_ai_sections", sections: pending });
  }

  const blocking = openIssues.filter(isBlockingOpen) as CopilotIssue[];
  if (blocking.length > 0) {
    reasons.push({ kind: "open_blocking_issues", issues: blocking });
  }

  return { ok: reasons.length === 0, reasons };
}

/** A human-readable message per block reason, for a toast or inline banner. */
export function describeSignBlockReason(reason: SignBlockReason): string {
  switch (reason.kind) {
    case "missing_sections":
      return `Required section${reason.sections.length > 1 ? "s" : ""} missing: ${reason.sections.join(", ")}.`;
    case "pending_ai_sections":
      return `AI-generated text is still pending review in: ${reason.sections.join(", ")}. Accept or edit it first.`;
    case "open_blocking_issues":
      return `${reason.issues.length} blocking copilot issue${reason.issues.length > 1 ? "s" : ""} must be resolved before signing.`;
    case "invalid_transition":
      return `A report in status "${reason.from}" cannot be signed.`;
  }
}

// --- Repository port ---------------------------------------------------------

export interface ReportLifecycleRepository {
  getReport(reportId: string): Promise<Report>;
  getTemplate(templateId: string): Promise<Pick<Template, "sections">>;
  listOpenIssues(reportId: string): Promise<CopilotIssue[]>;
  listVersions(reportId: string): Promise<ReportVersion[]>;
  /**
   * Updates status (and signedBy/signedAt when signing), passing `version`
   * for optimistic concurrency (`where id = $1 and version = $2`, per
   * docs/sessions.md). Returns the updated report. Throws
   * OptimisticConcurrencyError if the version has moved on.
   */
  updateStatus(
    reportId: string,
    expectedVersion: number,
    update: { status: ReportStatus; signedBy?: string; signedAt?: string },
  ): Promise<Report>;
}

export class OptimisticConcurrencyError extends Error {
  constructor(reportId: string) {
    super(`Report ${reportId} was changed by someone else. Reload and try again.`);
    this.name = "OptimisticConcurrencyError";
  }
}

export class SignBlockedError extends Error {
  readonly reasons: SignBlockReason[];
  constructor(reasons: SignBlockReason[]) {
    super(reasons.map(describeSignBlockReason).join(" "));
    this.name = "SignBlockedError";
    this.reasons = reasons;
  }
}

export class InvalidTransitionError extends Error {
  constructor(action: string, from: ReportStatus) {
    super(`Cannot ${action} a report in status "${from}".`);
    this.name = "InvalidTransitionError";
  }
}

// --- Use cases ---------------------------------------------------------------

/** draft -> preliminary. No content gate: a preliminary report is explicitly not final. */
export async function markPreliminary(repo: ReportLifecycleRepository, reportId: string): Promise<Report> {
  const report = await repo.getReport(reportId);
  const to = nextStatus(report.status, "mark_preliminary");
  if (!to) throw new InvalidTransitionError("mark preliminary", report.status);
  return repo.updateStatus(reportId, report.version, { status: to });
}

/**
 * draft|preliminary -> final, or amended -> final. Evaluates the sign gate
 * first so the radiologist gets a specific reason before the DB trigger
 * would reject it anyway.
 */
export async function signReport(
  repo: ReportLifecycleRepository,
  reportId: string,
  signedBy: string,
): Promise<Report> {
  const report = await repo.getReport(reportId);
  const to = nextStatus(report.status, "sign");
  if (!to) throw new InvalidTransitionError("sign", report.status);

  const [template, openIssues] = await Promise.all([
    repo.getTemplate(report.templateId),
    repo.listOpenIssues(reportId),
  ]);

  const gate = evaluateSignGate(report, report.content, template, openIssues);
  if (!gate.ok) throw new SignBlockedError(gate.reasons);

  return repo.updateStatus(reportId, report.version, {
    status: to,
    signedBy,
    signedAt: new Date().toISOString(),
  });
}

/** final -> amended. Re-opens content for editing; a subsequent signReport re-signs it. */
export async function amendReport(repo: ReportLifecycleRepository, reportId: string): Promise<Report> {
  const report = await repo.getReport(reportId);
  const to = nextStatus(report.status, "amend");
  if (!to) throw new InvalidTransitionError("amend", report.status);
  return repo.updateStatus(reportId, report.version, { status: to });
}

/** Full version history (report_versions), oldest first. */
export async function getVersionHistory(
  repo: ReportLifecycleRepository,
  reportId: string,
): Promise<ReportVersion[]> {
  const versions = await repo.listVersions(reportId);
  return [...versions].sort((a, b) => a.version - b.version);
}
