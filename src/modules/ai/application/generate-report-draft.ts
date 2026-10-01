import type { PartialGeneratedReport } from "../domain/generation";
import { REPORT_DRAFT_PROMPT_VERSION_ID, type ReportDraftPromptInput } from "./prompts/report-draft.v1";
import type { GenerationLogRepository } from "./generation-log";
import type { LLMProvider } from "./provider";

export interface GenerateReportDraftInput {
  reportId: string | null;
  createdBy: string | null;
  promptInput: ReportDraftPromptInput;
}

export interface GenerateReportDraftResult {
  /** Id of the ai_generations row. Attach to each ReportSection.ai.generationId. */
  generationId: string;
  /** For server-side consumers that want the object shape directly (tests, non-HTTP callers). */
  partialObjectStream: AsyncIterable<PartialGeneratedReport>;
  /** Text deltas for a route handler to forward as the HTTP response body. */
  textStream: AsyncIterable<string>;
  /** Await this (after the stream is consumed) to record completion/failure. */
  settle: () => Promise<void>;
}

/**
 * Streams a report draft and logs the call to ai_generations: a "pending" row
 * on start, completed with latency/tokens/outcome once the stream finishes
 * (or "error" if it throws). Never logs prompt text via `logger` (PHI policy);
 * the prompt lives only in the ai_generations.input column, guarded by RLS.
 */
export function generateReportDraft(
  provider: LLMProvider,
  log: GenerationLogRepository,
  input: GenerateReportDraftInput,
  generationId: string = crypto.randomUUID(),
): GenerateReportDraftResult {
  const startedAt = Date.now();
  const stream = provider.streamReport(input.promptInput);

  const logStarted = log.logStart({
    id: generationId,
    reportId: input.reportId,
    kind: "report_draft",
    promptVersion: REPORT_DRAFT_PROMPT_VERSION_ID,
    provider: provider.name,
    model: provider.model,
    input: input.promptInput,
    createdBy: input.createdBy,
  });

  const settle = async () => {
    await logStarted;
    try {
      const [object, usage] = await Promise.all([stream.object, stream.usage]);
      await log.complete(generationId, {
        output: object,
        latencyMs: Date.now() - startedAt,
        inputTokens: usage.inputTokens ?? null,
        outputTokens: usage.outputTokens ?? null,
        outcome: "pending", // awaiting radiologist review; see acceptAiSection / editSection
        error: null,
      });
    } catch (err) {
      await log.complete(generationId, {
        output: null,
        latencyMs: Date.now() - startedAt,
        inputTokens: null,
        outputTokens: null,
        outcome: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return { generationId, partialObjectStream: stream.partialObjectStream, textStream: stream.textStream, settle };
}
