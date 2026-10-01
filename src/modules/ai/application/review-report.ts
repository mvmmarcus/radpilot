import type { ReviewFinding } from "../domain/review";
import type { GenerationLogRepository } from "./generation-log";
import { REPORT_REVIEW_PROMPT_VERSION_ID, type ReportReviewPromptInput } from "./prompts/report-review.v1";
import type { LLMProvider } from "./provider";

export interface ReviewReportDraftInput {
  reportId: string | null;
  createdBy: string | null;
  promptInput: ReportReviewPromptInput;
}

/**
 * Runs the copilot's LLM review and logs the call to ai_generations (kind
 * "copilot_review"), like generateReportDraft does for drafts. Rethrows a
 * provider failure after recording it, so the caller decides how to surface it.
 */
export async function reviewReportDraft(
  provider: LLMProvider,
  log: GenerationLogRepository,
  input: ReviewReportDraftInput,
  generationId: string = crypto.randomUUID(),
): Promise<ReviewFinding[]> {
  const startedAt = Date.now();
  await log.logStart({
    id: generationId,
    reportId: input.reportId,
    kind: "copilot_review",
    promptVersion: REPORT_REVIEW_PROMPT_VERSION_ID,
    provider: provider.name,
    model: provider.model,
    input: input.promptInput,
    createdBy: input.createdBy,
  });

  try {
    const result = await provider.reviewReport(input.promptInput);
    await log.complete(generationId, {
      output: result.findings,
      latencyMs: Date.now() - startedAt,
      inputTokens: result.usage.inputTokens ?? null,
      outputTokens: result.usage.outputTokens ?? null,
      outcome: "accepted",
      error: null,
    });
    return result.findings;
  } catch (err) {
    await log.complete(generationId, {
      output: null,
      latencyMs: Date.now() - startedAt,
      inputTokens: null,
      outputTokens: null,
      outcome: "error",
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
