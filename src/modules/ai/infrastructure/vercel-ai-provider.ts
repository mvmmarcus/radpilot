import { generateObject, streamObject } from "ai";
import type { LanguageModel } from "ai";
import { GeneratedReportSchema } from "../domain/generation";
import { ReviewResultSchema } from "../domain/review";
import type {
  LLMProvider,
  ReviewReportInput,
  ReviewReportResult,
  StreamReportResult,
} from "../application/provider";
import { buildReportDraftPrompt, type ReportDraftPromptInput } from "../application/prompts/report-draft.v1";
import { buildReportReviewPrompt } from "../application/prompts/report-review.v1";

/**
 * Shared streamObject-based implementation for any Vercel AI SDK v6
 * LanguageModel (OpenAI, Anthropic, ...). See docs/adr/0002-llm-provider-port.md.
 */
export class VercelAiLLMProvider implements LLMProvider {
  constructor(
    readonly name: string,
    readonly model: string,
    private readonly languageModel: LanguageModel,
  ) {}

  streamReport(input: ReportDraftPromptInput): StreamReportResult {
    const { system, prompt } = buildReportDraftPrompt(input);

    const result = streamObject({
      model: this.languageModel,
      schema: GeneratedReportSchema,
      system,
      prompt,
    });

    return {
      partialObjectStream: result.partialObjectStream,
      textStream: result.textStream,
      object: result.object,
      usage: result.usage.then((usage) => ({
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      })),
    };
  }

  async reviewReport(input: ReviewReportInput): Promise<ReviewReportResult> {
    const { system, prompt } = buildReportReviewPrompt(input);

    // Not streamed: the copilot needs the whole list before it can store issues.
    const { object, usage } = await generateObject({
      model: this.languageModel,
      schema: ReviewResultSchema,
      system,
      prompt,
    });
    return {
      findings: object.findings,
      usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
    };
  }
}
