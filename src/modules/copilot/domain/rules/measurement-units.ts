import type { SectionKey } from "@/modules/templates";
import type { CopilotIssueDraft, CopilotRule, RuleContext } from "../issue";

/**
 * Flags two kinds of measurement problems in the Findings and Impression
 * sections:
 *  - a bare number that looks like a size but has no unit attached
 *    (e.g. "a 15 nodule" instead of "a 15 mm nodule")
 *  - a size with a unit that is implausible for a single lesion measurement
 *    (over 30 cm, i.e. over 300 mm) -- a likely typo (e.g. missed decimal).
 */

const SECTIONS_TO_CHECK: SectionKey[] = ["findings", "impression"];

const UNITS = ["mm", "cm", "millimeter", "millimeters", "centimeter", "centimeters"];
const UNIT_PATTERN = new RegExp(`^(?:${UNITS.join("|")})\\b`, "i");

/** A number (optionally decimal), not immediately preceded by a word character. */
const NUMBER_PATTERN = /(?<![\w.])(\d+(?:\.\d+)?)\s*([a-zA-Z]*)/g;

/** A trailing word that explains the number without it being a measurement (ages, counts, dates). */
const NON_MEASUREMENT_UNIT = /^(?:years?|yo|y\/o|months?|weeks?|days?|views?|packs?|pack-years?)\b/i;

/** Words nearby that mark a bare number as a size (so it should have a unit). */
const SIZE_WORD = /\b(?:nodule|mass|lesion|cyst|measuring|diameter)\b/i;

function mmValue(size: number, unit: string): number {
  return /cm|centimeter/i.test(unit) ? size * 10 : size;
}

function run(ctx: RuleContext): CopilotIssueDraft[] {
  const drafts: CopilotIssueDraft[] = [];

  for (const section of SECTIONS_TO_CHECK) {
    const text = ctx.content.sections[section]?.text ?? "";

    for (const match of text.matchAll(NUMBER_PATTERN)) {
      if (match.index === undefined) continue;
      const [full, numberText, trailing] = match;
      const value = Number(numberText);
      const hasUnit = UNIT_PATTERN.test(trailing);

      if (!hasUnit) {
        // Not a measurement at all (an age, a pack-year count, a view count...).
        if (trailing && NON_MEASUREMENT_UNIT.test(trailing)) continue;

        // A bare number in a size-like context, e.g. "8 nodule" or "nodule measuring 8".
        const window = text.slice(
          Math.max(0, match.index - 25),
          Math.min(text.length, match.index + full.length + 25),
        );
        if (!SIZE_WORD.test(window)) continue;

        drafts.push({
          source: "rule",
          ruleId: "measurement-units",
          severity: "warning",
          category: "measurement",
          message: `"${numberText}" has no unit. Did you mean "${numberText} mm" or "${numberText} cm"?`,
          span: { section, start: match.index, end: match.index + numberText.length, quote: numberText },
          suggestedFix: null,
        });
        continue;
      }

      const mm = mmValue(value, trailing);
      if (mm > 300) {
        drafts.push({
          source: "rule",
          ruleId: "measurement-units",
          severity: "warning",
          category: "measurement",
          message: `"${full.trim()}" (${mm} mm) is an implausible size for a single lesion. Check for a misplaced decimal.`,
          span: { section, start: match.index, end: match.index + full.length, quote: full },
          suggestedFix: null,
        });
      }
    }
  }

  return drafts;
}

export const measurementUnitsRule: CopilotRule = {
  id: "measurement-units",
  description: "Flags numbers without units near size-related words, and implausible lesion sizes.",
  run,
};
