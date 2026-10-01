import { z } from "zod";
import { BodyPartSchema, ModalitySchema, type BodyPart, type Modality } from "@/modules/studies";

/** The standard sections of a radiology report, in reading order. */
export const SECTION_KEYS = [
  "clinical_indication",
  "technique",
  "comparison",
  "findings",
  "impression",
  "recommendations",
] as const;
export const SectionKeySchema = z.enum(SECTION_KEYS);
export type SectionKey = z.infer<typeof SectionKeySchema>;

export const SECTION_LABELS: Record<SectionKey, string> = {
  clinical_indication: "Clinical indication",
  technique: "Technique",
  comparison: "Comparison",
  findings: "Findings",
  impression: "Impression",
  recommendations: "Recommendations",
};

export const TemplateSectionSchema = z.object({
  key: SectionKeySchema,
  label: z.string().min(1),
  /** A report cannot be signed while a required section is empty. */
  required: z.boolean(),
  /** Whether report generation is allowed to write this section. */
  aiAssisted: z.boolean(),
  placeholder: z.string().optional(),
  /** Pre-filled text when the report is created (e.g. the protocol for Technique). */
  defaultText: z.string().optional(),
});
export type TemplateSection = z.infer<typeof TemplateSectionSchema>;

/**
 * A text shortcut. Typing the trigger (e.g. ".nopte") in a section inserts the text.
 */
export const MacroSchema = z.object({
  trigger: z.string().regex(/^\.[a-z0-9-]+$/, "Macro triggers look like .name"),
  label: z.string().min(1),
  section: SectionKeySchema,
  text: z.string().min(1),
});
export type Macro = z.infer<typeof MacroSchema>;

export const TemplateSchema = z
  .object({
    id: z.uuid(),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    modality: ModalitySchema,
    bodyPart: BodyPartSchema,
    sections: z.array(TemplateSectionSchema).min(1),
    macros: z.array(MacroSchema),
    /** "Normal report" shortcut: section text for a study with no abnormality. */
    normalText: z.partialRecord(SectionKeySchema, z.string()),
  })
  .superRefine((template, ctx) => {
    const keys = template.sections.map((s) => s.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: "custom", path: ["sections"], message: "Section keys must be unique" });
    }
    for (const key of ["findings", "impression"] as const) {
      if (!keys.includes(key)) {
        ctx.addIssue({ code: "custom", path: ["sections"], message: `Template must include ${key}` });
      }
    }
    const triggers = template.macros.map((m) => m.trigger);
    if (new Set(triggers).size !== triggers.length) {
      ctx.addIssue({ code: "custom", path: ["macros"], message: "Macro triggers must be unique" });
    }
    for (const [i, macro] of template.macros.entries()) {
      if (!keys.includes(macro.section)) {
        ctx.addIssue({
          code: "custom",
          path: ["macros", i, "section"],
          message: `Macro targets section "${macro.section}", which the template does not have`,
        });
      }
    }
  });
export type Template = z.infer<typeof TemplateSchema>;

// --- Pure helpers ------------------------------------------------------------

/** Pick the template for an exam. Exact modality + body part match, else undefined. */
export function selectTemplate<T extends Pick<Template, "modality" | "bodyPart">>(
  templates: readonly T[],
  exam: { modality: Modality; bodyPart: BodyPart },
): T | undefined {
  return templates.find((t) => t.modality === exam.modality && t.bodyPart === exam.bodyPart);
}

export function findMacro(template: Pick<Template, "macros">, trigger: string): Macro | undefined {
  return template.macros.find((m) => m.trigger === trigger.trim().toLowerCase());
}
