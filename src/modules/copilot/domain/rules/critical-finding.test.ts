import { describe, expect, it } from "vitest";
import type { ReportContent } from "@/modules/reports";
import type { RuleContext } from "../issue";
import { criticalFindingRule } from "./critical-finding";

function contentWith(sections: Record<string, string>): ReportContent {
  const out: ReportContent["sections"] = {};
  for (const [key, text] of Object.entries(sections)) {
    out[key as keyof ReportContent["sections"]] = { text, source: "human", ai: null };
  }
  return { schemaVersion: 1, sections: out };
}

const baseCtx: Omit<RuleContext, "content"> = {
  study: { modality: "CT", bodyPart: "chest", indication: "Suspected PE" },
  patient: { sex: "F", ageYears: 58 },
};

describe("critical-finding rule", () => {
  it("flags pulmonary embolism", () => {
    const content = contentWith({ impression: "Acute right lower lobe pulmonary embolism." });
    const issues = criticalFindingRule.run({ ...baseCtx, content });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      ruleId: "critical-finding",
      severity: "blocking",
      category: "critical_finding",
    });
    expect(issues[0].message).toMatch(/pulmonary embolism/);
  });

  it("flags pneumothorax", () => {
    const content = contentWith({ findings: "Left apical pneumothorax." });
    expect(criticalFindingRule.run({ ...baseCtx, content })[0].message).toMatch(/pneumothorax/);
  });

  it("flags intracranial hemorrhage", () => {
    const content = contentWith({ findings: "Right convexity subdural hematoma." });
    expect(criticalFindingRule.run({ ...baseCtx, content })[0].message).toMatch(/intracranial hemorrhage/);
  });

  it("flags free air", () => {
    const content = contentWith({ findings: "Free intraperitoneal air beneath the diaphragm." });
    expect(criticalFindingRule.run({ ...baseCtx, content })[0].message).toMatch(/free air/);
  });

  it("flags aortic dissection", () => {
    const content = contentWith({ impression: "Type A aortic dissection." });
    expect(criticalFindingRule.run({ ...baseCtx, content })[0].message).toMatch(/aortic dissection/);
  });

  it("does not flag normal reports", () => {
    const content = contentWith({ findings: "Lungs are clear.", impression: "No acute abnormality." });
    expect(criticalFindingRule.run({ ...baseCtx, content })).toEqual([]);
  });

  it("reports each critical finding only once even if mentioned twice", () => {
    const content = contentWith({
      findings: "Pneumothorax on the left.",
      impression: "Left pneumothorax, unchanged.",
    });
    expect(criticalFindingRule.run({ ...baseCtx, content })).toHaveLength(1);
  });
});
