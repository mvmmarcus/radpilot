import { z } from "zod";
import { SECTION_KEYS, SectionKeySchema, type SectionKey, type Template } from "@/modules/templates";

/**
 * ReportContent is the canonical, editor-independent form of a report.
 * The Tiptap editor maps to and from it; copilot rules, FHIR export, PDF and
 * evals all read it. See docs/adr/0005-report-content-model.md.
 */

/** Where a section's current text came from. */
export const SECTION_SOURCES = ["human", "template", "ai"] as const;
export const SectionSourceSchema = z.enum(SECTION_SOURCES);
export type SectionSource = z.infer<typeof SectionSourceSchema>;

/**
 * Review state of AI-written text. `pending` text is visibly marked in the
 * editor and blocks signing until the radiologist accepts or edits it.
 */
export const AI_REVIEW_STATES = ["pending", "accepted", "edited"] as const;
export const AiReviewStateSchema = z.enum(AI_REVIEW_STATES);
export type AiReviewState = z.infer<typeof AiReviewStateSchema>;

export const ReportSectionSchema = z.object({
  /** Plain text. List-like sections (findings, impression) use one item per line. */
  text: z.string(),
  source: SectionSourceSchema,
  /** Set when source is "ai". */
  ai: z
    .object({
      generationId: z.uuid().nullable(),
      review: AiReviewStateSchema,
    })
    .nullable(),
});
export type ReportSection = z.infer<typeof ReportSectionSchema>;

export const ReportContentSchema = z.object({
  schemaVersion: z.literal(1),
  sections: z.partialRecord(SectionKeySchema, ReportSectionSchema),
});
export type ReportContent = z.infer<typeof ReportContentSchema>;

// --- Pure helpers ------------------------------------------------------------

/** New report content from a template. Clinical indication is copied from the order. */
export function createReportContent(
  template: Pick<Template, "sections">,
  exam: { indication: string },
): ReportContent {
  const sections: ReportContent["sections"] = {};
  for (const section of template.sections) {
    const text = section.key === "clinical_indication" ? exam.indication : (section.defaultText ?? "");
    sections[section.key] = { text, source: text ? "template" : "human", ai: null };
  }
  return { schemaVersion: 1, sections };
}

/** Fill every section the template has normal text for (the "normal report" shortcut). */
export function applyNormalReport(content: ReportContent, template: Pick<Template, "normalText">): ReportContent {
  const sections = { ...content.sections };
  for (const key of SECTION_KEYS) {
    const text = template.normalText[key];
    if (text !== undefined && sections[key]) {
      sections[key] = { text, source: "template", ai: null };
    }
  }
  return { ...content, sections };
}

/** A human edit. Editing pending AI text marks it as reviewed ("edited"). */
export function editSection(content: ReportContent, key: SectionKey, text: string): ReportContent {
  const current = content.sections[key];
  const ai = current?.ai ? { ...current.ai, review: "edited" as const } : null;
  return {
    ...content,
    sections: { ...content.sections, [key]: { text, source: ai ? "ai" : "human", ai } },
  };
}

/** Write AI output into a section, pending review. */
export function setAiSection(
  content: ReportContent,
  key: SectionKey,
  text: string,
  generationId: string | null,
): ReportContent {
  return {
    ...content,
    sections: { ...content.sections, [key]: { text, source: "ai", ai: { generationId, review: "pending" } } },
  };
}

/**
 * What a section should hold when a generated draft arrives and the section
 * already had text the radiologist or the template put there (`kept`).
 * Generation never destroys that text: Technique keeps the existing protocol
 * description instead of the model's (returns null: leave the section alone);
 * the other sections get the draft followed by what was already there (e.g. a
 * measurement inserted from the viewer).
 */
export function combineGeneratedText(key: SectionKey, generated: string, kept: string | undefined): string | null {
  const existing = kept?.trim() ?? "";
  if (existing.length === 0) return generated;
  if (key === "technique") return null;
  return generated.includes(existing) ? generated : `${generated}\n${existing}`;
}

export function acceptAiSection(content: ReportContent, key: SectionKey): ReportContent {
  const current = content.sections[key];
  if (!current?.ai || current.ai.review !== "pending") return content;
  return {
    ...content,
    sections: { ...content.sections, [key]: { ...current, ai: { ...current.ai, review: "accepted" } } },
  };
}

/** Sections whose AI text has not been reviewed yet. Signing is blocked while any exist. */
export function pendingAiSections(content: ReportContent): SectionKey[] {
  return SECTION_KEYS.filter((key) => content.sections[key]?.ai?.review === "pending");
}

/** Required sections that are empty. Signing is blocked while any exist. */
export function missingRequiredSections(
  content: ReportContent,
  template: Pick<Template, "sections">,
): SectionKey[] {
  return template.sections
    .filter((s) => s.required && !content.sections[s.key]?.text.trim())
    .map((s) => s.key);
}

/** Non-empty lines of a section, with list markers ("1.", "-", "•") stripped. */
export function sectionItems(content: ReportContent, key: SectionKey): string[] {
  const text = content.sections[key]?.text ?? "";
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim())
    .filter(Boolean);
}
