import { describe, expect, it } from "vitest";
import type { ReportContent } from "@/modules/reports";
import type { RuleContext } from "../issue";
import { findingMissingFromImpressionRule } from "./finding-missing-from-impression";

function contentWith(sections: Record<string, string>): ReportContent {
  const out: ReportContent["sections"] = {};
  for (const [key, text] of Object.entries(sections)) {
    out[key as keyof ReportContent["sections"]] = { text, source: "human", ai: null };
  }
  return { schemaVersion: 1, sections: out };
}

const baseCtx: Omit<RuleContext, "content"> = {
  study: { modality: "CT", bodyPart: "chest", indication: "Nodule follow-up" },
  patient: { sex: "M", ageYears: 64 },
};

describe("finding-missing-from-impression rule", () => {
  it("flags a significant finding not mentioned in the impression", () => {
    const content = contentWith({
      findings: "1. 8mm solid nodule in the right lower lobe.\n2. Lungs otherwise clear.",
      impression: "1. No acute cardiopulmonary abnormality.",
    });
    const issues = findingMissingFromImpressionRule.run({ ...baseCtx, content });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ ruleId: "finding-missing-from-impression", severity: "warning" });
    expect(issues[0].suggestedFix).toMatchObject({ kind: "append", section: "impression" });
  });

  it("does not flag a finding reflected in the impression", () => {
    const content = contentWith({
      findings: "1. 8mm solid nodule in the right lower lobe.",
      impression: "1. Right lower lobe nodule, 8mm, recommend follow-up per Fleischner.",
    });
    expect(findingMissingFromImpressionRule.run({ ...baseCtx, content })).toEqual([]);
  });

  it("does not flag normal/negative findings", () => {
    const content = contentWith({
      findings: "Lungs are clear. No pleural effusion. Heart size is normal.",
      impression: "No acute abnormality.",
    });
    expect(findingMissingFromImpressionRule.run({ ...baseCtx, content })).toEqual([]);
  });

  it("does not flag 'None' statements or bare viewer measurements", () => {
    const content = contentWith({
      findings: "Lines and tubes: None.\nPleura: Right apical pneumothorax.\n8 mm, series 1 image 13",
      impression: "Right apical pneumothorax.",
    });
    expect(findingMissingFromImpressionRule.run({ ...baseCtx, content })).toEqual([]);
  });

  it("does nothing when findings or impression is empty", () => {
    const content = contentWith({ findings: "", impression: "" });
    expect(findingMissingFromImpressionRule.run({ ...baseCtx, content })).toEqual([]);
  });
});
