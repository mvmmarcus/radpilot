import type { BodyPart, Modality, PatientSex } from "@/modules/studies";
import type { TemplateSection } from "@/modules/templates";

/**
 * Versioned prompt registry. Each entry is pure (template sections + exam
 * context + shorthand in, system/user prompt strings out), so it is testable
 * without a network call and so prompt changes are auditable by version id
 * (recorded as `ai_generations.prompt_version`, e.g. "report-draft@1").
 */

export const REPORT_DRAFT_PROMPT_ID = "report-draft";
export const REPORT_DRAFT_PROMPT_VERSION = 1;
export const REPORT_DRAFT_PROMPT_VERSION_ID = `${REPORT_DRAFT_PROMPT_ID}@${REPORT_DRAFT_PROMPT_VERSION}`;

export interface ExamContext {
  modality: Modality;
  bodyPart: BodyPart;
  indication: string;
  patientSex: PatientSex;
  patientAgeYears: number;
}

export interface ReportDraftPromptInput {
  /** The sections the generated report must cover (only AI-assisted ones matter to the model). */
  sections: Pick<TemplateSection, "key" | "label" | "required">[];
  exam: ExamContext;
  /** Radiologist shorthand, e.g. "RLL 8mm solid nodule, no effusion". */
  shorthand: string;
}

const SEX_LABELS: Record<PatientSex, string> = {
  F: "female",
  M: "male",
  O: "other",
  U: "unknown",
};

/** System + user prompt for report-draft@1. Never logged verbatim (see docs/adr/0004-phi-policy.md). */
export function buildReportDraftPrompt(input: ReportDraftPromptInput): { system: string; prompt: string } {
  const { sections, exam, shorthand } = input;
  const sectionList = sections.map((s) => `- ${s.key} (${s.label})${s.required ? " [required]" : ""}`).join("\n");

  const system = [
    "You are an assistant drafting a radiology report for a board-certified radiologist to review.",
    "You never make a final diagnosis; you draft text the radiologist will edit and sign.",
    "Write only findings supported by the radiologist's shorthand input. Do not invent measurements,",
    "locations or diagnoses that are not implied by the input.",
    "Use standard radiology report phrasing, organized by anatomic system.",
    "Every impression item must trace back to a finding. Recommendations should follow standard",
    "guidelines (e.g. Fleischner for pulmonary nodules) when applicable, and should be left empty",
    "if no follow-up is warranted.",
  ].join(" ");

  const prompt = [
    `Modality: ${exam.modality}`,
    `Body part: ${exam.bodyPart}`,
    `Clinical indication: ${exam.indication}`,
    `Patient: ${exam.patientAgeYears}-year-old ${SEX_LABELS[exam.patientSex]}`,
    "",
    "Report sections to produce:",
    sectionList,
    "",
    "Radiologist shorthand (the source of truth for findings):",
    shorthand,
  ].join("\n");

  return { system, prompt };
}
