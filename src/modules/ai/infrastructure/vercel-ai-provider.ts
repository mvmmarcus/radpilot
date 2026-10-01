import { streamObject } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { GeneratedReportSchema } from "../domain/generation";
import type {
  LLMProvider,
  ReviewReportInput,
  ReviewReportResult,
  StreamReportResult,
} from "../application/provider";
import { buildReportDraftPrompt, type ReportDraftPromptInput } from "../application/prompts/report-draft.v1";

const ReviewNotesSchema = z.object({
  notes: z.string().describe("A short paragraph summarizing any inconsistencies found, or 'No issues found.'"),
});

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
    const sectionText = Object.entries(input.sections)
      .map(([key, text]) => `${key}: ${text}`)
      .join("\n\n");

    const result = streamObject({
      model: this.languageModel,
      schema: ReviewNotesSchema,
      system:
        "You review a radiology report draft for internal consistency (not a medical judgment). " +
        "Summarize any inconsistencies you notice in one short paragraph of notes.",
      prompt: sectionText,
    });
    const object = await result.object;
    return { notes: object.notes };
  }
}
