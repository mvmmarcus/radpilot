import { z } from "zod";

/**
 * Structured output of the copilot's LLM review. The model only reports
 * consistency and clarity problems: it never produces a blocking issue
 * (safety-critical checks are deterministic rules, see docs/adr/0003-hybrid-copilot.md).
 * Descriptions are sent to the model, so they are written as instructions.
 */
export const ReviewFindingSchema = z.object({
  section: z.string().describe("Key of the section the problem is in, exactly as given in the input."),
  quote: z.string().describe("The exact words from that section that the problem refers to. Copy them verbatim."),
  message: z.string().describe("One sentence telling the radiologist what is inconsistent or unclear."),
  severity: z.enum(["warning", "info"]).describe("warning for a contradiction or omission, info for a wording suggestion."),
});
export type ReviewFinding = z.infer<typeof ReviewFindingSchema>;

export const ReviewResultSchema = z.object({
  findings: z.array(ReviewFindingSchema).describe("At most 5 problems. Empty if the report is consistent."),
});
export type ReviewResult = z.infer<typeof ReviewResultSchema>;
