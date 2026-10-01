// Server-only entry point: application use cases wired to infrastructure
// (Supabase repositories, LLM adapters). Import from Server Components,
// Server Functions and Route Handlers only.

// Row mappers.
export { toAiGeneration, type AiGenerationRow } from "./infrastructure/mappers";

// Ports. (PartialGeneratedReport lives in the domain entry point, @/modules/ai.)
export type { LLMProvider, StreamReportResult, ReviewReportInput, ReviewReportResult } from "./application/provider";
export type {
  GenerationLogRepository,
  GenerationLogEntry,
  GenerationLogCompletion,
} from "./application/generation-log";

// Prompt registry.
export {
  buildReportDraftPrompt,
  REPORT_DRAFT_PROMPT_ID,
  REPORT_DRAFT_PROMPT_VERSION,
  REPORT_DRAFT_PROMPT_VERSION_ID,
  type ExamContext,
  type ReportDraftPromptInput,
} from "./application/prompts/report-draft.v1";

// Adapters.
export { MockLLMProvider, mockGenerateReport } from "./infrastructure/mock-provider";
export { createOpenAiProvider } from "./infrastructure/openai-provider";
export { createAnthropicProvider } from "./infrastructure/anthropic-provider";
export { getLLMProvider } from "./infrastructure/provider-factory";
export { SupabaseGenerationLogRepository } from "./infrastructure/supabase-generation-log";

// Use cases.
export { generateReportDraft, type GenerateReportDraftInput, type GenerateReportDraftResult } from "./application/generate-report-draft";
export { recordGenerationOutcome } from "./application/record-generation-outcome";
