import { describe, expect, it } from "vitest";
import type { Template } from "@/modules/templates";
import { createReportContent, editSection, setAiSection, acceptAiSection } from "../../domain/content";
import { reportContentToTiptapDoc, tiptapDocToReportContent } from "./content-mapping";

const template: Pick<Template, "sections"> = {
  sections: [
    { key: "clinical_indication", label: "Clinical indication", required: true, aiAssisted: false },
    { key: "technique", label: "Technique", required: true, aiAssisted: true, defaultText: "CTA chest." },
    { key: "findings", label: "Findings", required: true, aiAssisted: true },
    { key: "impression", label: "Impression", required: true, aiAssisted: true },
  ],
};

describe("ReportContent <-> Tiptap round-trip", () => {
  it("round-trips a freshly created report unchanged", () => {
    const content = createReportContent(template, { indication: "Suspected PE" });
    const doc = reportContentToTiptapDoc(content, template);
    expect(tiptapDocToReportContent(doc, content)).toEqual(content);
  });

  it("produces one reportSection node per template section, in order", () => {
    const content = createReportContent(template, { indication: "Suspected PE" });
    const doc = reportContentToTiptapDoc(content, template);
    expect(doc.content?.map((n) => n.attrs?.key)).toEqual([
      "clinical_indication",
      "technique",
      "findings",
      "impression",
    ]);
  });

  it("round-trips multi-line text as one paragraph per line", () => {
    let content = createReportContent(template, { indication: "x" });
    content = editSection(content, "impression", "1. Acute PE.\n2. No infarct.");
    const doc = reportContentToTiptapDoc(content, template);

    const impressionNode = doc.content?.find((n) => n.attrs?.key === "impression");
    expect(impressionNode?.content).toHaveLength(2);
    expect(tiptapDocToReportContent(doc, content).sections.impression?.text).toBe("1. Acute PE.\n2. No infarct.");
  });

  it("marks AI-pending text and keeps it pending when unchanged in the doc", () => {
    let content = createReportContent(template, { indication: "x" });
    content = setAiSection(content, "findings", "Right lower lobe nodule.", "gen-1");
    const doc = reportContentToTiptapDoc(content, template);

    const findingsNode = doc.content?.find((n) => n.attrs?.key === "findings");
    const textNode = findingsNode?.content?.[0]?.content?.[0];
    expect(textNode?.marks).toEqual([{ type: "aiPending" }]);

    const roundTripped = tiptapDocToReportContent(doc, content);
    expect(roundTripped.sections.findings).toEqual(content.sections.findings);
  });

  it("demotes pending AI text to 'edited' when the mark is removed (simulating a human edit)", () => {
    let content = createReportContent(template, { indication: "x" });
    content = setAiSection(content, "findings", "Right lower lobe nodule.", "gen-1");
    const doc = reportContentToTiptapDoc(content, template);

    // Simulate the user typing inside the AI text: Tiptap/ProseMirror drops
    // marks on edited characters, so the paragraph's text node loses `marks`.
    const findingsNode = doc.content?.find((n) => n.attrs?.key === "findings");
    if (!findingsNode) throw new Error("findings node not found");
    findingsNode.content = [{ type: "paragraph", content: [{ type: "text", text: "Right lower lobe nodule, 8mm." }] }];

    const updated = tiptapDocToReportContent(doc, content);
    expect(updated.sections.findings).toEqual({
      text: "Right lower lobe nodule, 8mm.",
      source: "ai",
      ai: { generationId: "gen-1", review: "edited" },
    });
  });

  it("keeps an accepted AI section accepted when the doc round-trips unchanged", () => {
    let content = createReportContent(template, { indication: "x" });
    content = setAiSection(content, "impression", "No acute abnormality.", "gen-2");
    content = acceptAiSection(content, "impression");
    const doc = reportContentToTiptapDoc(content, template);

    expect(tiptapDocToReportContent(doc, content).sections.impression).toEqual(content.sections.impression);
  });

  it("ignores unknown section keys defensively", () => {
    const content = createReportContent(template, { indication: "x" });
    const doc = reportContentToTiptapDoc(content, template);
    doc.content!.push({ type: "reportSection", attrs: { key: "not_a_real_section" }, content: [] });
    expect(() => tiptapDocToReportContent(doc, content)).not.toThrow();
  });
});
