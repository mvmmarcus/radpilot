import { sectionItems } from "@/modules/reports";
import type { CopilotIssueDraft, CopilotRule, RuleContext } from "../issue";

/**
 * Flags a significant findings-section item that has no corresponding word
 * overlap in any impression item, so it risks being forgotten in the summary
 * a referring clinician actually reads.
 *
 * "Significant" is approximated by excluding common normal/negative phrasing
 * ("no ", "unremarkable", "within normal limits", "clear", "negative").
 * Overlap is approximated by shared significant words (>=4 letters, ignoring
 * a short stop list) between a findings item and any impression item.
 */

const NORMAL_PHRASES = [
  /\bno\b/i,
  /\bunremarkable\b/i,
  /\bwithin normal limits\b/i,
  /\bclear\b/i,
  /\bnegative\b/i,
  /\bnormal\b/i,
  /\bwnl\b/i,
];

const STOP_WORDS = new Set([
  "with",
  "without",
  "there",
  "this",
  "that",
  "from",
  "into",
  "shows",
  "show",
  "noted",
  "seen",
  "again",
  "visualized",
  "measuring",
  "measures",
]);

function isSignificant(item: string): boolean {
  return !NORMAL_PHRASES.some((pattern) => pattern.test(item));
}

function significantWords(item: string): string[] {
  return item
    .toLowerCase()
    .replace(/[^a-z0-9.\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
}

function hasOverlap(findingWords: string[], impressionItems: string[][]): boolean {
  return impressionItems.some((words) => words.some((w) => findingWords.includes(w)));
}

function run(ctx: RuleContext): CopilotIssueDraft[] {
  const findings = sectionItems(ctx.content, "findings");
  const impression = sectionItems(ctx.content, "impression");
  if (findings.length === 0 || impression.length === 0) return [];

  const impressionWordSets = impression.map(significantWords);
  const drafts: CopilotIssueDraft[] = [];

  for (const finding of findings) {
    if (!isSignificant(finding)) continue;
    const words = significantWords(finding);
    if (words.length === 0) continue;
    if (hasOverlap(words, impressionWordSets)) continue;

    drafts.push({
      source: "rule",
      ruleId: "finding-missing-from-impression",
      severity: "warning",
      category: "missing_from_impression",
      message: `This finding does not appear to be reflected in the impression: "${finding}"`,
      span: null,
      suggestedFix: { kind: "append", section: "impression", text: finding },
    });
  }

  return drafts;
}

export const findingMissingFromImpressionRule: CopilotRule = {
  id: "finding-missing-from-impression",
  description: "Flags significant findings-section items with no word overlap in any impression item.",
  run,
};
