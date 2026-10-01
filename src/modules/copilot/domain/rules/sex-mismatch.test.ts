import { describe, expect, it } from "vitest";
import type { ReportContent } from "@/modules/reports";
import type { RuleContext } from "../issue";
import { sexMismatchRule } from "./sex-mismatch";

function contentWith(sections: Record<string, string>): ReportContent {
  const out: ReportContent["sections"] = {};
  for (const [key, text] of Object.entries(sections)) {
    out[key as keyof ReportContent["sections"]] = { text, source: "human", ai: null };
  }
  return { schemaVersion: 1, sections: out };
}

const baseCtx: Omit<RuleContext, "content" | "patient"> = {
  study: { modality: "CT", bodyPart: "abdomen_pelvis", indication: "Painless hematuria" },
};

describe("sex-mismatch rule", () => {
  it("flags prostate mentioned for a female patient", () => {
    const content = contentWith({ findings: "Mildly enlarged prostate with calcifications." });
    const issues = sexMismatchRule.run({ ...baseCtx, patient: { sex: "F", ageYears: 68 }, content });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ ruleId: "sex-mismatch", severity: "blocking", category: "sex_mismatch" });
  });

  it("flags uterus/ovary mentioned for a male patient", () => {
    const content = contentWith({ findings: "Uterus and right ovary are unremarkable." });
    const issues = sexMismatchRule.run({ ...baseCtx, patient: { sex: "M", ageYears: 55 }, content });
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });

  it("does not flag matching organs", () => {
    const content = contentWith({ findings: "Prostate is mildly enlarged." });
    const issues = sexMismatchRule.run({ ...baseCtx, patient: { sex: "M", ageYears: 68 }, content });
    expect(issues).toEqual([]);
  });

  it("does not flag when sex is unknown or other", () => {
    const content = contentWith({ findings: "Prostate is mildly enlarged." });
    expect(sexMismatchRule.run({ ...baseCtx, patient: { sex: "U", ageYears: 68 }, content })).toEqual([]);
    expect(sexMismatchRule.run({ ...baseCtx, patient: { sex: "O", ageYears: 68 }, content })).toEqual([]);
  });
});
