import type { ExamContext } from "./report-draft.v1";

/** Versioned prompt for the copilot's LLM review (recorded as ai_generations.prompt_version). */
export const REPORT_REVIEW_PROMPT_ID = "report-review";
export const REPORT_REVIEW_PROMPT_VERSION = 1;
export const REPORT_REVIEW_PROMPT_VERSION_ID = `${REPORT_REVIEW_PROMPT_ID}@${REPORT_REVIEW_PROMPT_VERSION}`;

export interface ReportReviewPromptInput {
  /** Section key -> current text. Empty sections are omitted by the caller. */
  sections: Record<string, string>;
  exam: ExamContext;
}

/** System + user prompt for report-review@1. Never logged verbatim (see docs/adr/0004-phi-policy.md). */
export function buildReportReviewPrompt(input: ReportReviewPromptInput): { system: string; prompt: string } {
  const { sections, exam } = input;

  const system = [
    "You proofread a radiology report draft for internal consistency and clarity.",
    "You do not make a medical judgment and you do not add findings.",
    "Report only problems visible in the text: a statement in one section contradicted by another,",
    "an impression item with no supporting finding, a recommendation that does not follow from the findings,",
    "an ambiguous or incomplete sentence, or text that does not match the exam or patient described.",
    "Do not report laterality conflicts, sex mismatches, missing measurement units or critical findings:",
    "other checks already cover those.",
    "If the report is consistent, return an empty list.",
  ].join(" ");

  const prompt = [
    `Exam: ${exam.modality} ${exam.bodyPart}. Patient: ${exam.patientAgeYears} years, sex ${exam.patientSex}.`,
    `Indication: ${exam.indication}`,
    "",
    ...Object.entries(sections).map(([key, text]) => `[${key}]\n${text}\n`),
  ].join("\n");

  return { system, prompt };
}
