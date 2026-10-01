import type { SectionKey } from "@/modules/templates";
import type { CopilotIssueDraft, CopilotRule, RuleContext } from "../issue";
import { findAllSpans } from "./text-scan";

/**
 * Flags sex-specific organs (prostate, uterus, ovary) mentioned in a report
 * for a patient whose recorded sex makes that organ absent, e.g. "prostate"
 * in a report for a female patient.
 */

const SEX_SPECIFIC_ORGANS: { pattern: RegExp; organ: string; presentInSex: "M" | "F" }[] = [
  { pattern: /\bprostate\b/i, organ: "prostate", presentInSex: "M" },
  { pattern: /\buterus\b|\buterine\b/i, organ: "uterus", presentInSex: "F" },
  { pattern: /\bovar(?:y|ies|ian)\b/i, organ: "ovary", presentInSex: "F" },
];

const SECTIONS_TO_CHECK: SectionKey[] = ["clinical_indication", "findings", "impression"];

function run(ctx: RuleContext): CopilotIssueDraft[] {
  const { sex } = ctx.patient;
  // Only flag definite mismatches: M reports with F-only organs, F reports
  // with M-only organs. Sex "O"/"U" is not flagged (insufficient information).
  if (sex !== "M" && sex !== "F") return [];

  const drafts: CopilotIssueDraft[] = [];

  for (const { pattern, organ, presentInSex } of SEX_SPECIFIC_ORGANS) {
    if (sex === presentInSex) continue;

    for (const section of SECTIONS_TO_CHECK) {
      const text = ctx.content.sections[section]?.text ?? "";
      const spans = findAllSpans(section, text, pattern);
      for (const span of spans) {
        drafts.push({
          source: "rule",
          ruleId: "sex-mismatch",
          severity: "blocking",
          category: "sex_mismatch",
          message: `"${organ}" mentioned in ${section}, but the patient's recorded sex is ${sex}.`,
          span,
          suggestedFix: null,
        });
      }
    }
  }

  return drafts;
}

export const sexMismatchRule: CopilotRule = {
  id: "sex-mismatch",
  description: "Flags sex-specific organs (prostate, uterus, ovary) that don't match the patient's recorded sex.",
  run,
};
