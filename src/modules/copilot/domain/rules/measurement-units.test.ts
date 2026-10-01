import { describe, expect, it } from "vitest";
import type { ReportContent } from "@/modules/reports";
import type { RuleContext } from "../issue";
import { measurementUnitsRule } from "./measurement-units";

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

describe("measurement-units rule", () => {
  it("flags a bare number near a size word with no unit", () => {
    const content = contentWith({ findings: "There is an 8 nodule in the right lower lobe." });
    const issues = measurementUnitsRule.run({ ...baseCtx, content });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ ruleId: "measurement-units", severity: "warning", category: "measurement" });
    expect(issues[0].message).toMatch(/no unit/);
  });

  it("does not flag a correctly unit-tagged measurement", () => {
    const content = contentWith({ findings: "There is an 8 mm nodule in the right lower lobe." });
    expect(measurementUnitsRule.run({ ...baseCtx, content })).toEqual([]);
  });

  it("flags an implausible size (likely decimal typo)", () => {
    const content = contentWith({ findings: "A 350 mm mass is seen in the liver." });
    const issues = measurementUnitsRule.run({ ...baseCtx, content });
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/implausible/);
  });

  it("converts cm to mm when checking plausibility", () => {
    const content = contentWith({ findings: "A 35 cm mass is seen in the liver." });
    expect(measurementUnitsRule.run({ ...baseCtx, content })[0].message).toMatch(/350 mm/);
  });

  it("does not flag plausible cm measurements", () => {
    const content = contentWith({ findings: "A 3.5 cm mass is seen in the liver." });
    expect(measurementUnitsRule.run({ ...baseCtx, content })).toEqual([]);
  });

  it("ignores numbers that are not measurements (ages, pack-years, lobes)", () => {
    const content = contentWith({
      clinical_indication: "64 year old male, 30 pack-years.",
      findings: "Nodule in the right lower lobe, segment 6.",
    });
    expect(measurementUnitsRule.run({ ...baseCtx, content })).toEqual([]);
  });
});
