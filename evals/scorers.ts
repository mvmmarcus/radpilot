import type { GeneratedReport } from "@/modules/ai";
import type { SectionKey } from "@/modules/templates";
import type { GoldenCase } from "./cases";

/** One scorer's verdict on one case. `pass` false fails the case overall. */
export interface ScoreResult {
  scorer: string;
  pass: boolean;
  detail?: string;
}

function sectionText(report: GeneratedReport, key: SectionKey): string {
  if (key === "technique") return report.technique;
  if (key === "findings") return report.findings.join("\n");
  if (key === "impression") return report.impression.join("\n");
  if (key === "recommendations") return report.recommendations.join("\n");
  return ""; // clinical_indication/comparison are not produced by GeneratedReportSchema
}

/** Required sections the model is responsible for (findings/impression/technique) must be non-empty. */
function scoreRequiredSections(report: GeneratedReport, golden: GoldenCase): ScoreResult {
  const modelSections: SectionKey[] = ["technique", "findings", "impression"];
  const missing = golden.expect.requiredSections
    .filter((key): key is SectionKey => modelSections.includes(key as SectionKey))
    .filter((key) => sectionText(report, key).trim().length === 0);
  return {
    scorer: "required_sections_present",
    pass: missing.length === 0,
    detail: missing.length ? `empty: ${missing.join(", ")}` : undefined,
  };
}

/** Laterality words in the shorthand must still appear somewhere in findings+impression. */
function scoreLateralityPreserved(report: GeneratedReport, golden: GoldenCase): ScoreResult {
  const expected = golden.expect.preserveLaterality;
  if (!expected || expected.length === 0) {
    return { scorer: "laterality_preserved", pass: true, detail: "n/a" };
  }
  const haystack = `${report.findings.join(" ")} ${report.impression.join(" ")}`.toLowerCase();
  const missing = expected.filter((word) => !haystack.includes(word));
  return {
    scorer: "laterality_preserved",
    pass: missing.length === 0,
    detail: missing.length ? `missing: ${missing.join(", ")}` : undefined,
  };
}

/**
 * Every impression item must trace to a finding: each impression line should
 * share at least one non-trivial word (4+ chars) with some findings line, so
 * the model is not asserting conclusions unsupported by the findings it wrote.
 * Negation ("no acute abnormality") always passes trivially since it asserts nothing.
 */
function scoreImpressionTracesToFindings(report: GeneratedReport): ScoreResult {
  const stopwords = new Set(["acute", "with", "without", "there", "that", "this", "from", "into"]);
  const findingWords = new Set(
    report.findings
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !stopwords.has(w)),
  );

  const untraced = report.impression.filter((line) => {
    const lower = line.toLowerCase();
    if (/no acute abnormality|no specific findings/.test(lower)) return false;
    const words = lower.split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !stopwords.has(w));
    if (words.length === 0) return false;
    return !words.some((w) => findingWords.has(w));
  });

  return {
    scorer: "impression_traces_to_findings",
    pass: untraced.length === 0,
    detail: untraced.length ? `untraced: ${untraced.join(" | ")}` : undefined,
  };
}

/** Impression should mention the expected anatomic/finding term(s), case-insensitive substring match. */
function scoreImpressionMentions(report: GeneratedReport, golden: GoldenCase): ScoreResult {
  const expected = golden.expect.impressionShouldMention;
  if (!expected || expected.length === 0) {
    return { scorer: "impression_mentions_key_terms", pass: true, detail: "n/a" };
  }
  const haystack = report.impression.join(" ").toLowerCase();
  const missing = expected.filter((term) => !haystack.includes(term.toLowerCase()));
  return {
    scorer: "impression_mentions_key_terms",
    pass: missing.length === 0,
    detail: missing.length ? `missing: ${missing.join(", ")}` : undefined,
  };
}

/** A non-empty recommendation when a guideline applies; empty when the case expects none is NOT penalized (optional). */
function scoreRecommendationPresence(report: GeneratedReport, golden: GoldenCase): ScoreResult {
  const hasRecommendation = report.recommendations.some((r) => r.trim().length > 0);
  if (golden.expect.recommendationExpected && !hasRecommendation) {
    return { scorer: "recommendation_present_when_expected", pass: false, detail: "expected a recommendation, got none" };
  }
  return { scorer: "recommendation_present_when_expected", pass: true };
}

/** Fully negative shorthand should produce a clearly negative impression, not an invented finding. */
function scoreNormalImpression(report: GeneratedReport, golden: GoldenCase): ScoreResult {
  if (!golden.expect.expectNormalImpression) {
    return { scorer: "normal_impression_when_expected", pass: true, detail: "n/a" };
  }
  const text = report.impression.join(" ").toLowerCase();
  const pass = /no acute|normal|negative|no specific finding/.test(text);
  return {
    scorer: "normal_impression_when_expected",
    pass,
    detail: pass ? undefined : `impression: ${report.impression.join(" | ")}`,
  };
}

export function scoreReport(report: GeneratedReport, golden: GoldenCase): ScoreResult[] {
  return [
    scoreRequiredSections(report, golden),
    scoreLateralityPreserved(report, golden),
    scoreImpressionTracesToFindings(report),
    scoreImpressionMentions(report, golden),
    scoreRecommendationPresence(report, golden),
    scoreNormalImpression(report, golden),
  ];
}
