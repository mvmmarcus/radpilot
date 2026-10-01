import type { SectionKey } from "@/modules/templates";
import type { CopilotIssueDraft, CopilotRule, RuleContext } from "../issue";
import { findSpan } from "./text-scan";

/**
 * Flags when the clinical indication, findings and impression disagree about
 * which side (left/right) an organ or finding is on, e.g. indication says
 * "left thyroid nodule" but impression says "right thyroid nodule".
 *
 * Simplified: looks for "<left|right> <organ word>" within a fixed distance,
 * per organ keyword, across clinical_indication, findings and impression.
 */

const ORGAN_KEYWORDS = [
  "lung",
  "lobe",
  "kidney",
  "adnexa",
  "ovary",
  "thyroid",
  "breast",
  "subdural",
  "pneumothorax",
] as const;

const SECTIONS_TO_CHECK: SectionKey[] = ["clinical_indication", "findings", "impression"];

const LATERALITY_PATTERN = /\b(left|right)\b/i;

interface Mention {
  section: SectionKey;
  side: "left" | "right";
  organ: string;
  index: number;
}

function findMentions(text: string, section: SectionKey, organ: string): Mention[] {
  const mentions: Mention[] = [];
  const organPattern = new RegExp(`\\b${organ}\\b`, "gi");
  const sidePattern = new RegExp(LATERALITY_PATTERN.source, "gi");
  const sideMatches = [...text.matchAll(sidePattern)].filter((m) => m.index !== undefined);
  if (sideMatches.length === 0) return mentions;

  // Look for "<side> ... <organ>" within ~25 characters, picking the closest
  // laterality word to each organ mention (either order).
  for (const organMatch of text.matchAll(organPattern)) {
    if (organMatch.index === undefined) continue;
    let closest: (typeof sideMatches)[number] | null = null;
    let closestDistance = Infinity;
    for (const sideMatch of sideMatches) {
      const distance = Math.abs(sideMatch.index! - organMatch.index);
      if (distance <= 25 && distance < closestDistance) {
        closest = sideMatch;
        closestDistance = distance;
      }
    }
    if (!closest) continue;
    mentions.push({
      section,
      side: closest[0].toLowerCase() as "left" | "right",
      organ,
      index: closest.index!,
    });
  }
  return mentions;
}

function run(ctx: RuleContext): CopilotIssueDraft[] {
  const drafts: CopilotIssueDraft[] = [];

  for (const organ of ORGAN_KEYWORDS) {
    const mentionsByOrgan: Mention[] = [];
    for (const section of SECTIONS_TO_CHECK) {
      const text = ctx.content.sections[section]?.text ?? "";
      mentionsByOrgan.push(...findMentions(text, section, organ));
    }
    if (mentionsByOrgan.length < 2) continue;

    const sides = new Set(mentionsByOrgan.map((m) => m.side));
    if (sides.size < 2) continue;

    // Conflict found: report it once per organ, pointing at the last mention
    // (usually the impression, which is what a radiologist re-checks last).
    const last = mentionsByOrgan[mentionsByOrgan.length - 1];
    const first = mentionsByOrgan[0];
    const text = ctx.content.sections[last.section]?.text ?? "";
    const span = findSpan(last.section, text, new RegExp(`\\b${last.side}\\b`, "i")) ?? {
      section: last.section,
      start: last.index,
      end: last.index + last.side.length,
      quote: last.side,
    };

    drafts.push({
      source: "rule",
      ruleId: "laterality-conflict",
      severity: "blocking",
      category: "laterality",
      message: `Possible laterality conflict for "${organ}": ${first.section} says ${first.side}, ${last.section} says ${last.side}.`,
      span,
      suggestedFix: {
        kind: "replace",
        span,
        text: first.side,
      },
    });
  }

  return drafts;
}

export const lateralityConflictRule: CopilotRule = {
  id: "laterality-conflict",
  description:
    "Flags left/right disagreement between the clinical indication, findings and impression for the same organ.",
  run,
};
