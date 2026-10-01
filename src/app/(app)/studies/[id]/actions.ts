"use server";

import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import {
  checkAiQuota,
  getLLMProvider,
  reviewReportDraft,
  SupabaseGenerationLogRepository,
} from "@/modules/ai/server";
import { SupabaseAuditRecorder } from "@/modules/audit/server";
import {
  CopilotService,
  llmFindingsToDrafts,
  mockCopilotReviewer,
  SupabaseCopilotIssueRepository,
  type CopilotReviewer,
  type RunCopilotResult,
} from "@/modules/copilot/server";
import { applyFix, type CopilotIssue, type SuggestedFix } from "@/modules/copilot";
import {
  amendReport,
  describeSignBlockReason,
  evaluateSignGate,
  markPreliminary,
  ReportVersionConflictError,
  saveReportContent,
  signReport,
  SignBlockedError,
  SupabaseReportLifecycleRepository,
  SupabaseReportRepository,
} from "@/modules/reports/server";
import type { Report, ReportContent } from "@/modules/reports";
import type { BodyPart, Modality, PatientSex } from "@/modules/studies";

export interface ActionResult<T> {
  ok: boolean;
  error?: string;
  data?: T;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");
  return { supabase, user };
}

/** Autosave: persists content with optimistic concurrency. */
export async function saveReportContentAction(
  reportId: string,
  expectedVersion: number,
  content: ReportContent,
): Promise<ActionResult<Report>> {
  try {
    const { supabase } = await requireUser();
    const repo = new SupabaseReportRepository(supabase);
    const report = await saveReportContent(repo, reportId, expectedVersion, content);
    return { ok: true, data: report };
  } catch (error) {
    if (error instanceof ReportVersionConflictError) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: error instanceof Error ? error.message : "Failed to save report." };
  }
}

export interface RunCopilotParams {
  reportId: string;
  content: ReportContent;
  study: { modality: Modality; bodyPart: BodyPart; indication: string };
  patient: { sex: PatientSex; ageYears: number };
  /** Also run the LLM review. False for the debounced run after each edit, true when the radiologist asks for it. */
  review?: boolean;
}

export interface RunCopilotActionResult extends RunCopilotResult {
  /** Set when the LLM review was asked for but failed; the deterministic rules still ran. */
  reviewError?: string;
}

/**
 * Runs the deterministic rules over the current content (debounced from the
 * client), and the LLM review as well when `review` is set.
 */
export async function runCopilotAction(params: RunCopilotParams): Promise<ActionResult<RunCopilotActionResult>> {
  try {
    const { supabase, user } = await requireUser();
    const review = params.review ?? false;
    const provider = getLLMProvider();
    const log = new SupabaseGenerationLogRepository(supabase);

    if (review && provider.name !== "mock") {
      const quota = await checkAiQuota(log, user.id);
      if (!quota.ok) return { ok: false, error: quota.message };
    }

    // The CopilotReviewer port never throws: a provider failure is reported
    // next to the rule results instead of failing the whole run.
    let reviewError: string | undefined;
    const reviewer: CopilotReviewer = {
      async reviewReport(input) {
        try {
          const findings = await reviewReportDraft(provider, log, {
            reportId: params.reportId,
            createdBy: user.id,
            promptInput: {
              sections: Object.fromEntries(
                Object.entries(input.content.sections)
                  .map(([key, section]) => [key, section?.text ?? ""])
                  .filter(([, text]) => text.trim().length > 0),
              ),
              exam: {
                modality: input.study.modality,
                bodyPart: input.study.bodyPart,
                indication: input.study.indication,
                patientSex: input.patient.sex,
                patientAgeYears: input.patient.ageYears,
              },
            },
          });
          return llmFindingsToDrafts(findings, input.content);
        } catch (error) {
          reviewError = "The AI review failed. The rule checks still ran.";
          logger.error("copilot review failed", {
            reportId: params.reportId,
            error: error instanceof Error ? error.message : String(error),
          });
          return [];
        }
      },
    };

    const service = new CopilotService(
      new SupabaseCopilotIssueRepository(supabase),
      review ? reviewer : mockCopilotReviewer,
      new SupabaseAuditRecorder(supabase),
    );
    const result = await service.run(
      { reportId: params.reportId, content: params.content, study: params.study, patient: params.patient },
      { review },
    );
    return { ok: true, data: { ...result, reviewError } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Copilot run failed." };
  }
}

export interface ApplyFixParams {
  reportId: string;
  issue: Pick<CopilotIssue, "id">;
  fix: SuggestedFix;
  content: ReportContent;
  expectedVersion: number;
}

/** Applies a suggested fix, resolves the issue, and saves the resulting content. */
export async function applyCopilotFixAction(params: ApplyFixParams): Promise<ActionResult<Report>> {
  try {
    const { supabase, user } = await requireUser();
    const service = new CopilotService(
      new SupabaseCopilotIssueRepository(supabase),
      mockCopilotReviewer,
      new SupabaseAuditRecorder(supabase),
    );
    // Save first: if the save is rejected (locked report, stale version) the
    // issue must stay open rather than be resolved with no content change.
    const repo = new SupabaseReportRepository(supabase);
    const report = await saveReportContent(
      repo,
      params.reportId,
      params.expectedVersion,
      applyFix(params.content, params.fix),
    );
    await service.applyAndResolve(params.issue, params.fix, params.content, user.id);
    return { ok: true, data: report };
  } catch (error) {
    if (error instanceof ReportVersionConflictError) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: error instanceof Error ? error.message : "Failed to apply fix." };
  }
}

/** Dismisses a non-blocking issue without changing content. */
export async function dismissCopilotIssueAction(
  issue: Pick<CopilotIssue, "id" | "severity">,
): Promise<ActionResult<null>> {
  try {
    const { supabase, user } = await requireUser();
    const service = new CopilotService(
      new SupabaseCopilotIssueRepository(supabase),
      mockCopilotReviewer,
      new SupabaseAuditRecorder(supabase),
    );
    await service.dismiss(issue, user.id);
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to dismiss issue." };
  }
}

/**
 * Acknowledges a blocking issue with no fix to apply. For a critical finding
 * (the radiologist confirms it was communicated) the report is also flagged
 * as critical; other blocking issues are acknowledged as not applicable.
 */
export async function acknowledgeCopilotIssueAction(
  reportId: string,
  issue: Pick<CopilotIssue, "id" | "severity" | "category">,
): Promise<ActionResult<Report | null>> {
  try {
    const { supabase, user } = await requireUser();
    const service = new CopilotService(
      new SupabaseCopilotIssueRepository(supabase),
      mockCopilotReviewer,
      new SupabaseAuditRecorder(supabase),
    );
    await service.acknowledge(issue, user.id);
    if (issue.category !== "critical_finding") return { ok: true, data: null };
    const report = await new SupabaseReportRepository(supabase).markCritical(reportId);
    return { ok: true, data: report };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to acknowledge issue." };
  }
}

/** Friendly pre-check before signReport; does not mutate anything. */
export async function evaluateSignGateAction(reportId: string): Promise<
  ActionResult<{ ok: boolean; messages: string[] }>
> {
  try {
    const { supabase } = await requireUser();
    const lifecycleRepo = new SupabaseReportLifecycleRepository(supabase);
    const report = await lifecycleRepo.getReport(reportId);
    const [template, openIssues] = await Promise.all([
      lifecycleRepo.getTemplate(report.templateId),
      lifecycleRepo.listOpenIssues(reportId),
    ]);
    const gate = evaluateSignGate(report, report.content, template, openIssues);
    return { ok: true, data: { ok: gate.ok, messages: gate.reasons.map(describeSignBlockReason) } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to evaluate sign gate." };
  }
}

export async function signReportAction(reportId: string): Promise<ActionResult<Report>> {
  try {
    const { supabase, user } = await requireUser();
    const lifecycleRepo = new SupabaseReportLifecycleRepository(supabase);
    // The DB trigger on reports (reports_after_update) already writes the
    // report.signed audit event on this status change; no explicit call needed here.
    const report = await signReport(lifecycleRepo, reportId, user.id);
    return { ok: true, data: report };
  } catch (error) {
    if (error instanceof SignBlockedError) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: error instanceof Error ? error.message : "Failed to sign report." };
  }
}

export async function markPreliminaryAction(reportId: string): Promise<ActionResult<Report>> {
  try {
    const { supabase } = await requireUser();
    const lifecycleRepo = new SupabaseReportLifecycleRepository(supabase);
    const report = await markPreliminary(lifecycleRepo, reportId);
    return { ok: true, data: report };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to mark preliminary." };
  }
}

export async function amendReportAction(reportId: string): Promise<ActionResult<Report>> {
  try {
    const { supabase } = await requireUser();
    const lifecycleRepo = new SupabaseReportLifecycleRepository(supabase);
    const report = await amendReport(lifecycleRepo, reportId);
    return { ok: true, data: report };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to amend report." };
  }
}
