import { describe, expect, it } from "vitest";
import { createReportContent } from "@/modules/reports";
import type { SectionKey, Template } from "@/modules/templates";
import { applyFix } from "./apply-fix";

const template: Pick<Template, "sections"> = {
  sections: [
    { key: "findings", label: "Findings", required: true, aiAssisted: true },
    { key: "impression", label: "Impression", required: true, aiAssisted: true },
    { key: "recommendations", label: "Recommendations", required: false, aiAssisted: false },
  ],
};

function withText(key: SectionKey, text: string) {
  const content = createReportContent(template, { indication: "x" });
  return { ...content, sections: { ...content.sections, [key]: { text, source: "human" as const, ai: null } } };
}

describe("applyFix", () => {
  it("replaces an exact span", () => {
    const content = withText("impression", "1. Left lower lobe pneumonia.");
    const start = content.sections.impression!.text.indexOf("Left");
    const result = applyFix(content, {
      kind: "replace",
      span: { section: "impression", start, end: start + 4, quote: "Left" },
      text: "Right",
    });
    expect(result.sections.impression?.text).toBe("1. Right lower lobe pneumonia.");
  });

  it("falls back to finding the quote when the recorded range has shifted", () => {
    const content = withText("impression", "1. Left lower lobe pneumonia.");
    const result = applyFix(content, {
      kind: "replace",
      // Deliberately wrong offsets.
      span: { section: "impression", start: 0, end: 0, quote: "Left" },
      text: "Right",
    });
    expect(result.sections.impression?.text).toBe("1. Right lower lobe pneumonia.");
  });

  it("returns content unchanged when the quote can no longer be found", () => {
    const content = withText("impression", "1. No acute abnormality.");
    const result = applyFix(content, {
      kind: "replace",
      span: { section: "impression", start: 0, end: 4, quote: "Left" },
      text: "Right",
    });
    expect(result).toEqual(content);
  });

  it("marks the edited section as human / edited correctly via editSection semantics", () => {
    const content = withText("findings", "Right lower lobe nodule.");
    const result = applyFix(content, {
      kind: "replace",
      span: { section: "findings", start: 0, end: 5, quote: "Right" },
      text: "Left",
    });
    expect(result.sections.findings?.source).toBe("human");
  });

  it("appends to an empty section", () => {
    const content = withText("recommendations", "");
    const result = applyFix(content, {
      kind: "append",
      section: "recommendations",
      text: "CT chest in 6-12 months.",
    });
    expect(result.sections.recommendations?.text).toBe("CT chest in 6-12 months.");
  });

  it("appends on a new line to a non-empty section", () => {
    const content = withText("recommendations", "Clinical correlation recommended.");
    const result = applyFix(content, {
      kind: "append",
      section: "recommendations",
      text: "CT chest in 6-12 months.",
    });
    expect(result.sections.recommendations?.text).toBe(
      "Clinical correlation recommended.\nCT chest in 6-12 months.",
    );
  });
});
