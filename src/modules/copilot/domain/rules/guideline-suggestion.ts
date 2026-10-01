import { fleischnerRecommendation, type FleischnerRisk } from "@/modules/guidelines";
import type { CopilotIssueDraft, CopilotRule, RuleContext } from "../issue";
import { findSpan } from "./text-scan";

/**
 * When the Findings section describes an incidental solid pulmonary nodule
 * with a size, suggests the matching Fleischner 2017 follow-up recommendation
 * as an "append" fix to Recommendations. High risk is approximated from a
 * smoking history mention in the clinical indication (a simplification; the
 * real risk factors also include family history, emphysema, spiculation,
 * upper-lobe location, etc).
 */

const NODULE_PATTERN =
  /\b(\d+(?:\.\d+)?)\s*(mm|cm)\b[^.]{0,40}?\bnodules?\b|\bnodules?\b[^.]{0,40}?\b(\d+(?:\.\d+)?)\s*(mm|cm)\b/i;

const MULTIPLE_PATTERN = /\bnodules\b|\bmultiple\b.{0,20}\bnodule/i;

const HIGH_RISK_PATTERN = /\bsmok(?:er|ing)\b|\bpack[- ]years?\b/i;

function parseSizeMm(text: string): number | null {
  const match = NODULE_PATTERN.exec(text);
  if (!match) return null;
  const value = Number(match[1] ?? match[3]);
  const unit = match[2] ?? match[4];
  if (Number.isNaN(value)) return null;
  return /cm/i.test(unit) ? value * 10 : value;
}

function run(ctx: RuleContext): CopilotIssueDraft[] {
  const findingsText = ctx.content.sections.findings?.text ?? "";
  if (!/\bnodules?\b/i.test(findingsText)) return [];

  const sizeMm = parseSizeMm(findingsText);
  if (sizeMm === null) return [];

  const multiple = MULTIPLE_PATTERN.test(findingsText);
  const indicationText = ctx.content.sections.clinical_indication?.text ?? "";
  const risk: FleischnerRisk = HIGH_RISK_PATTERN.test(indicationText) || HIGH_RISK_PATTERN.test(findingsText)
    ? "high"
    : "low";

  const recommendation = fleischnerRecommendation({ sizeMm, multiple, risk });
  const recommendationsText = ctx.content.sections.recommendations?.text ?? "";
  if (recommendationsText.toLowerCase().includes(recommendation.followUpText.toLowerCase())) return [];

  const span = findSpan("findings", findingsText, /\bnodules?\b/i);

  return [
    {
      source: "guideline",
      ruleId: recommendation.guidelineId,
      severity: "info",
      category: "guideline",
      message: `Fleischner 2017: ${recommendation.followUpText}`,
      span,
      suggestedFix: { kind: "append", section: "recommendations", text: recommendation.followUpText },
    },
  ];
}

export const guidelineSuggestionRule: CopilotRule = {
  id: "guideline-suggestion",
  description: "Suggests the Fleischner 2017 follow-up recommendation when an incidental solid nodule is found.",
  run,
};
