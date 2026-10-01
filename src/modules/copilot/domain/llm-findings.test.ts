import { describe, expect, it } from "vitest";
import type { ReportContent } from "@/modules/reports";
import { llmFindingsToDrafts } from "./llm-findings";

const content: ReportContent = {
  schemaVersion: 1,
  sections: {
    findings: { text: "Lungs: Clear. No pleural effusion.", source: "human", ai: null },
    impression: { text: "Small right pleural effusion.", source: "human", ai: null },
  },
};

describe("llmFindingsToDrafts", () => {
  it("maps a finding to an llm issue with a span on the quoted text", () => {
    const [draft] = llmFindingsToDrafts(
      [{ section: "impression", quote: "right pleural effusion", message: "Findings say no effusion.", severity: "warning" }],
      content,
    );
    expect(draft).toMatchObject({ source: "llm", ruleId: null, severity: "warning", category: "clarity", suggestedFix: null });
    expect(draft.span).toEqual({ section: "impression", start: 6, end: 28, quote: "right pleural effusion" });
  });

  it("keeps the issue without a span when the quote or section cannot be found", () => {
    const drafts = llmFindingsToDrafts(
      [
        { section: "impression", quote: "words that are not there", message: "A.", severity: "info" },
        { section: "not_a_section", quote: "Clear", message: "B.", severity: "info" },
      ],
      content,
    );
    expect(drafts.map((d) => d.span)).toEqual([null, null]);
  });

  it("drops findings with an empty message", () => {
    expect(llmFindingsToDrafts([{ section: "findings", quote: "Clear", message: "  ", severity: "info" }], content)).toEqual([]);
  });
});
