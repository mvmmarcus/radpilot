import { describe, expect, it } from "vitest";
import type { ReportContent } from "@/modules/reports";
import type { RuleContext } from "../issue";
import { lateralityConflictRule } from "./laterality-conflict";

function contentWith(sections: Record<string, string>): ReportContent {
  const out: ReportContent["sections"] = {};
  for (const [key, text] of Object.entries(sections)) {
    out[key as keyof ReportContent["sections"]] = { text, source: "human", ai: null };
  }
  return { schemaVersion: 1, sections: out };
}

const baseCtx: Omit<RuleContext, "content"> = {
  study: { modality: "US", bodyPart: "thyroid", indication: "Palpable nodule" },
  patient: { sex: "F", ageYears: 39 },
};

describe("laterality-conflict rule", () => {
  it("flags a conflict between indication and impression for the same organ", () => {
    const content = contentWith({
      clinical_indication: "Palpable left thyroid nodule.",
      findings: "Solid nodule in the left thyroid lobe.",
      impression: "Right thyroid nodule, TI-RADS TR4.",
    });
    const issues = lateralityConflictRule.run({ ...baseCtx, content });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      ruleId: "laterality-conflict",
      severity: "blocking",
      category: "laterality",
    });
    expect(issues[0].message).toMatch(/thyroid/);
  });

  it("does not flag when all sections agree on the side", () => {
    const content = contentWith({
      clinical_indication: "Palpable left thyroid nodule.",
      findings: "Solid nodule in the left thyroid lobe.",
      impression: "Left thyroid nodule, TI-RADS TR4.",
    });
    expect(lateralityConflictRule.run({ ...baseCtx, content })).toEqual([]);
  });

  it("does not flag when an organ is mentioned only once", () => {
    const content = contentWith({
      clinical_indication: "Screening.",
      findings: "Right lower lobe nodule.",
      impression: "Nodule as above.",
    });
    expect(lateralityConflictRule.run({ ...baseCtx, content })).toEqual([]);
  });

  it("flags independently for different organs", () => {
    const content = contentWith({
      clinical_indication: "Right lower quadrant pain.",
      findings: "Normal right ovary. Left adnexa shows a cyst.",
      impression: "Right adnexa cyst.",
    });
    const issues = lateralityConflictRule.run({ ...baseCtx, content });
    expect(issues.some((i) => i.message.includes("adnexa"))).toBe(true);
  });
});
