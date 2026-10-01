import { describe, expect, it } from "vitest";
import type { Template } from "@/modules/templates";
import {
  acceptAiSection,
  applyNormalReport,
  createReportContent,
  editSection,
  missingRequiredSections,
  pendingAiSections,
  ReportContentSchema,
  sectionItems,
  setAiSection,
} from "./content";
import { allowedActions, isEditable, nextStatus } from "./status";

const template: Pick<Template, "sections" | "normalText"> = {
  sections: [
    { key: "clinical_indication", label: "Clinical indication", required: true, aiAssisted: false },
    { key: "technique", label: "Technique", required: true, aiAssisted: true, defaultText: "CTA chest." },
    { key: "findings", label: "Findings", required: true, aiAssisted: true },
    { key: "impression", label: "Impression", required: true, aiAssisted: true },
  ],
  normalText: { findings: "Lungs are clear.", impression: "No acute abnormality." },
};

describe("report status machine", () => {
  it("follows the agreed lifecycle", () => {
    expect(nextStatus("draft", "sign")).toBe("final");
    expect(nextStatus("draft", "mark_preliminary")).toBe("preliminary");
    expect(nextStatus("preliminary", "sign")).toBe("final");
    expect(nextStatus("final", "amend")).toBe("amended");
    expect(nextStatus("amended", "sign")).toBe("final");
  });

  it("rejects transitions that are not in the diagram", () => {
    expect(nextStatus("final", "sign")).toBeNull();
    expect(nextStatus("draft", "amend")).toBeNull();
    expect(nextStatus("preliminary", "mark_preliminary")).toBeNull();
    expect(allowedActions("final")).toEqual(["amend"]);
  });

  it("locks content only while final", () => {
    expect(isEditable("draft")).toBe(true);
    expect(isEditable("amended")).toBe(true);
    expect(isEditable("final")).toBe(false);
  });
});

describe("report content", () => {
  it("creates content from a template and the order indication", () => {
    const content = createReportContent(template, { indication: "Suspected PE" });
    expect(ReportContentSchema.parse(content)).toEqual(content);
    expect(content.sections.clinical_indication).toEqual({ text: "Suspected PE", source: "template", ai: null });
    expect(content.sections.technique?.text).toBe("CTA chest.");
    expect(content.sections.findings).toEqual({ text: "", source: "human", ai: null });
    expect(missingRequiredSections(content, template)).toEqual(["findings", "impression"]);
  });

  it("tracks AI text from pending to accepted or edited", () => {
    let content = createReportContent(template, { indication: "Suspected PE" });
    content = setAiSection(content, "findings", "Filling defect in the right lower lobe artery.", null);
    content = setAiSection(content, "impression", "1. Acute right lower lobe PE.", null);
    expect(pendingAiSections(content)).toEqual(["findings", "impression"]);

    content = acceptAiSection(content, "findings");
    content = editSection(content, "impression", "1. Acute right lower lobe segmental PE.");
    expect(pendingAiSections(content)).toEqual([]);
    expect(content.sections.findings?.ai?.review).toBe("accepted");
    expect(content.sections.impression).toMatchObject({ source: "ai", ai: { review: "edited" } });
  });

  it("treats an edit to human text as human", () => {
    const content = editSection(createReportContent(template, { indication: "x" }), "findings", "Clear lungs.");
    expect(content.sections.findings).toEqual({ text: "Clear lungs.", source: "human", ai: null });
  });

  it("applies the normal-report shortcut", () => {
    const content = applyNormalReport(createReportContent(template, { indication: "Pre-op" }), template);
    expect(content.sections.impression?.text).toBe("No acute abnormality.");
    expect(missingRequiredSections(content, template)).toEqual([]);
  });

  it("splits list sections into items", () => {
    const content = editSection(
      createReportContent(template, { indication: "x" }),
      "impression",
      "1. Acute PE.\n\n2) No infarct.\n- Emphysema.",
    );
    expect(sectionItems(content, "impression")).toEqual(["Acute PE.", "No infarct.", "Emphysema."]);
  });
});
