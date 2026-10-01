import { describe, expect, it } from "vitest";
import type { Template } from "../domain/template";
import { getTemplateForStudy } from "./get-template-for-study";
import type { TemplateRepository } from "./repository";

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
  macros: [],
  normalText: {},
};

function inMemoryRepository(templates: Template[]): Pick<TemplateRepository, "listTemplates"> {
  return { listTemplates: async () => templates };
}

describe("getTemplateForStudy", () => {
  it("returns the template matching modality and body part", async () => {
    const repo = inMemoryRepository([ctChest]);
    const result = await getTemplateForStudy(repo, { modality: "CT", bodyPart: "chest" });
    expect(result?.slug).toBe("ct-chest");
  });

  it("returns null when no template matches", async () => {
    const repo = inMemoryRepository([ctChest]);
    const result = await getTemplateForStudy(repo, { modality: "MR", bodyPart: "head" });
    expect(result).toBeNull();
  });
});
