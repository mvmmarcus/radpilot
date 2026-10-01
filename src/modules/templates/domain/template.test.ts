import { describe, expect, it } from "vitest";
import { findMacro, selectTemplate, TemplateSchema, type Template } from "./template";

const ctChest: Template = {
  id: "00000000-0000-4000-8000-0000000000a1",
  slug: "ct-chest",
  name: "CT Chest",
  modality: "CT",
  bodyPart: "chest",
  sections: [
    { key: "clinical_indication", label: "Clinical indication", required: true, aiAssisted: false },
    { key: "findings", label: "Findings", required: true, aiAssisted: true },
    { key: "impression", label: "Impression", required: true, aiAssisted: true },
  ],
  macros: [{ trigger: ".nopte", label: "No PE", section: "impression", text: "No pulmonary embolism." }],
  normalText: { impression: "No acute cardiopulmonary abnormality." },
};

describe("TemplateSchema", () => {
  it("accepts a valid template", () => {
    expect(TemplateSchema.parse(ctChest).slug).toBe("ct-chest");
  });

  it("requires findings and impression sections", () => {
    const result = TemplateSchema.safeParse({ ...ctChest, sections: ctChest.sections.slice(0, 2) });
    expect(result.success).toBe(false);
  });

  it("rejects a macro that targets a missing section", () => {
    const result = TemplateSchema.safeParse({
      ...ctChest,
      macros: [{ trigger: ".tech", label: "Tech", section: "technique", text: "Axial images." }],
    });
    expect(result.success).toBe(false);
  });
});

describe("selectTemplate / findMacro", () => {
  it("matches on modality and body part", () => {
    expect(selectTemplate([ctChest], { modality: "CT", bodyPart: "chest" })?.slug).toBe("ct-chest");
    expect(selectTemplate([ctChest], { modality: "CR", bodyPart: "chest" })).toBeUndefined();
  });

  it("finds a macro case-insensitively", () => {
    expect(findMacro(ctChest, " .NOPTE ")?.text).toBe("No pulmonary embolism.");
  });
});
