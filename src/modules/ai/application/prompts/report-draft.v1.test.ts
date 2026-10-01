import { describe, expect, it } from "vitest";
import { buildReportDraftPrompt, REPORT_DRAFT_PROMPT_VERSION_ID } from "./report-draft.v1";

describe("buildReportDraftPrompt", () => {
  it("includes exam context, sections and shorthand in the user prompt", () => {
    const { system, prompt } = buildReportDraftPrompt({
      sections: [
        { key: "findings", label: "Findings", required: true },
        { key: "impression", label: "Impression", required: true },
      ],
      exam: { modality: "CT", bodyPart: "chest", indication: "Suspected PE", patientSex: "F", patientAgeYears: 58 },
      shorthand: "RLL 8mm solid nodule, no effusion",
    });

    expect(prompt).toContain("Modality: CT");
    expect(prompt).toContain("chest");
    expect(prompt).toContain("Suspected PE");
    expect(prompt).toContain("58-year-old female");
    expect(prompt).toContain("findings (Findings) [required]");
    expect(prompt).toContain("RLL 8mm solid nodule, no effusion");
    expect(system).toMatch(/never make a final diagnosis/i);
  });

  it("has a stable versioned id", () => {
    expect(REPORT_DRAFT_PROMPT_VERSION_ID).toBe("report-draft@1");
  });
});
