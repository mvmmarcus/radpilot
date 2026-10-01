import { describe, expect, it } from "vitest";
import type { ReportContent } from "@/modules/reports";
import type { RuleContext } from "../issue";
import { guidelineSuggestionRule } from "./guideline-suggestion";

function contentWith(sections: Record<string, string>): ReportContent {
  const out: ReportContent["sections"] = {};
  for (const [key, text] of Object.entries(sections)) {
    out[key as keyof ReportContent["sections"]] = { text, source: "human", ai: null };
  }
  return { schemaVersion: 1, sections: out };
}

const baseCtx: Omit<RuleContext, "content"> = {
  study: { modality: "CT", bodyPart: "chest", indication: "Incidental nodule" },
  patient: { sex: "M", ageYears: 64 },
};

describe("guideline-suggestion rule (Fleischner)", () => {
  it("suggests a recommendation for a solid nodule with size (low risk)", () => {
    const content = contentWith({
      clinical_indication: "Incidental nodule, non-smoker.",
      findings: "8 mm solid nodule in the right lower lobe.",
    });
    const issues = guidelineSuggestionRule.run({ ...baseCtx, content });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ source: "guideline", ruleId: "fleischner-2017", category: "guideline" });
    expect(issues[0].suggestedFix).toMatchObject({ kind: "append", section: "recommendations" });
    expect(issues[0].message).toMatch(/6-12 months/);
  });

  it("uses high risk when the indication mentions smoking history", () => {
    const content = contentWith({
      clinical_indication: "Incidental nodule, 30 pack-years.",
      findings: "6 mm solid nodule in the right lower lobe.",
    });
    const issues = guidelineSuggestionRule.run({ ...baseCtx, content });
    expect(issues[0].message).toBe("Fleischner 2017: CT at 6-12 months, then at 18-24 months.");
  });

  it("does nothing once the recommendation is already in Recommendations", () => {
    const content = contentWith({
      clinical_indication: "Incidental nodule, non-smoker.",
      findings: "8 mm solid nodule in the right lower lobe.",
    });
    const [issue] = guidelineSuggestionRule.run({ ...baseCtx, content });
    const fix = issue.suggestedFix as { text: string };
    const applied = contentWith({
      clinical_indication: "Incidental nodule, non-smoker.",
      findings: "8 mm solid nodule in the right lower lobe.",
      recommendations: `Clinical correlation.\n${fix.text}`,
    });
    expect(guidelineSuggestionRule.run({ ...baseCtx, content: applied })).toEqual([]);
  });

  it("does nothing when there is no nodule mentioned", () => {
    const content = contentWith({ findings: "Lungs are clear." });
    expect(guidelineSuggestionRule.run({ ...baseCtx, content })).toEqual([]);
  });

  it("does nothing when a nodule is mentioned without a parsable size", () => {
    const content = contentWith({ findings: "A small nodule is noted." });
    expect(guidelineSuggestionRule.run({ ...baseCtx, content })).toEqual([]);
  });

  it("handles cm sizes", () => {
    const content = contentWith({ findings: "A 1.2 cm solid nodule in the left upper lobe." });
    const issues = guidelineSuggestionRule.run({ ...baseCtx, content });
    expect(issues[0].message).toMatch(/3 months/);
  });

  it("detects multiple nodules", () => {
    const content = contentWith({ findings: "Multiple small nodules, largest 4 mm, in both lungs." });
    const issues = guidelineSuggestionRule.run({ ...baseCtx, content });
    expect(issues[0].message).toBe("Fleischner 2017: No routine follow-up required.");
  });
});
