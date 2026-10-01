import { describe, expect, it } from "vitest";
import { findMacro } from "../domain/template";
import { toTemplate, type TemplateRow } from "./mappers";

const row: TemplateRow = {
  id: "30000000-0000-4000-8000-000000000004",
  slug: "cr-chest",
  name: "Chest Radiograph",
  modality: "CR",
  body_part: "chest",
  sections: [
    { key: "clinical_indication", label: "Clinical indication", required: true, aiAssisted: false },
    { key: "comparison", label: "Comparison", required: true, aiAssisted: false, defaultText: "None." },
    { key: "findings", label: "Findings", required: true, aiAssisted: true },
    { key: "impression", label: "Impression", required: true, aiAssisted: true },
  ],
  macros: [{ trigger: ".noptx", label: "No pneumothorax", section: "impression", text: "No pneumothorax." }],
  normal_text: { impression: "No acute cardiopulmonary abnormality." },
  created_at: "2026-10-01T00:00:00+00:00",
  updated_at: "2026-10-01T00:00:00+00:00",
};

describe("templates mappers", () => {
  it("maps a template row to a validated Template", () => {
    const template = toTemplate(row);
    expect(template.bodyPart).toBe("chest");
    expect(template.sections.map((s) => s.key)).toEqual(["clinical_indication", "comparison", "findings", "impression"]);
    expect(template.normalText.impression).toBe("No acute cardiopulmonary abnormality.");
    expect(findMacro(template, ".noptx")?.text).toBe("No pneumothorax.");
  });

  it("rejects template JSON that breaks TemplateSchema", () => {
    const withoutImpression = { ...row, sections: (row.sections as unknown[]).slice(0, 3) } as TemplateRow;
    expect(() => toTemplate(withoutImpression)).toThrow(/Template must include impression/);
    expect(() => toTemplate({ ...row, macros: [{ trigger: "noptx" }] })).toThrow(/templates\/30000000/);
  });
});
