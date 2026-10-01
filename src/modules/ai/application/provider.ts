import type { GeneratedReport, PartialGeneratedReport } from "../domain/generation";
import type { ReportDraftPromptInput } from "./prompts/report-draft.v1";

export interface StreamReportResult {
  /** Async iterable of partial objects; the last one satisfies GeneratedReportSchema. Used server-side (editor state, logging). */
  partialObjectStream: AsyncIterable<PartialGeneratedReport>;
  /**
   * Text deltas that, concatenated, form the growing JSON text of the
   * object (the wire format @ai-sdk/react's useObject expects from a route
   * handler). Reuses the AI SDK's own incremental JSON encoder for the real
   * adapters; the mock provider synthesizes an equivalent stream.
   */
  textStream: AsyncIterable<string>;
  /** Resolves to the final, schema-validated object once the stream finishes. */
  object: Promise<GeneratedReport>;
  /** Resolves once the response is finished (undefined fields mean the provider did not report them). */
  usage: Promise<{ inputTokens?: number; outputTokens?: number }>;
}

export interface ReviewReportInput {
  sections: Record<string, string>;
}

export interface ReviewReportResult {
  /** Free-text review notes. The copilot module (Track C) interprets these. */
  notes: string;
}

/**
 * Port every model adapter implements. Chosen by getServerEnv().AI_PROVIDER.
 * See docs/adr/0002-llm-provider-port.md.
 */
export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  streamReport(input: ReportDraftPromptInput): StreamReportResult;
  reviewReport(input: ReviewReportInput): Promise<ReviewReportResult>;
}
