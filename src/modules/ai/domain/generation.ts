import { z } from "zod";

export const GENERATION_KINDS = ["report_draft", "copilot_review"] as const;
export const GenerationKindSchema = z.enum(GENERATION_KINDS);
export type GenerationKind = z.infer<typeof GenerationKindSchema>;

/**
 * What happened to an AI output. This feeds the acceptance-rate metric:
 * accepted / (accepted + edited + rejected).
 */
export const GENERATION_OUTCOMES = ["pending", "accepted", "edited", "rejected", "error"] as const;
export const GenerationOutcomeSchema = z.enum(GENERATION_OUTCOMES);
export type GenerationOutcome = z.infer<typeof GenerationOutcomeSchema>;

/**
 * Structured output of report generation (the `streamObject` schema).
 * Descriptions are sent to the model, so they are written as instructions.
 */
export const GeneratedReportSchema = z.object({
  technique: z.string().describe("One or two sentences describing how the exam was performed."),
  findings: z
    .array(z.string())
    .describe("One finding per item, organized by anatomy. Only findings supported by the input."),
  impression: z
    .array(z.string())
    .describe("Most important conclusions first. Every item must trace back to a finding."),
  recommendations: z
    .array(z.string())
    .describe("Follow-up recommendations, e.g. per Fleischner. Empty if none apply."),
});
export type GeneratedReport = z.infer<typeof GeneratedReportSchema>;

/**
 * A partial, possibly-incomplete GeneratedReport, as streamed to the client
 * by src/app/api/generate and consumed by @ai-sdk/react's useObject. List
 * fields may contain `undefined` holes while an item is still arriving.
 */
export type PartialGeneratedReport = {
  [K in keyof GeneratedReport]?: GeneratedReport[K] extends Array<infer Item>
    ? Array<Item | undefined> | undefined
    : GeneratedReport[K];
};

/** One logged model call (table ai_generations). Inputs and outputs may contain PHI: never log them elsewhere. */
export const AiGenerationSchema = z.object({
  id: z.uuid(),
  reportId: z.uuid().nullable(),
  kind: GenerationKindSchema,
  /** Prompt registry id and version, e.g. "report-draft@3". */
  promptVersion: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  input: z.unknown(),
  output: z.unknown().nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  outcome: GenerationOutcomeSchema,
  error: z.string().nullable(),
  createdBy: z.uuid().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type AiGeneration = z.infer<typeof AiGenerationSchema>;
