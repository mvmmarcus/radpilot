import { describe, expect, it } from "vitest";
import { CopilotIssueDraftSchema, isBlockingOpen, SuggestedFixSchema } from "./issue";

describe("copilot issue contract", () => {
  it("accepts a rule issue with a replace fix", () => {
    const draft = CopilotIssueDraftSchema.parse({
      source: "rule",
      ruleId: "laterality-conflict",
      severity: "blocking",
      category: "laterality",
      message: "Findings say right lower lobe; impression says left.",
      span: { section: "impression", start: 10, end: 14, quote: "left" },
      suggestedFix: {
        kind: "replace",
        span: { section: "impression", start: 10, end: 14, quote: "left" },
        text: "right",
      },
    });
    expect(draft.suggestedFix?.kind).toBe("replace");
  });

  it("rejects a span that ends before it starts", () => {
    expect(
      SuggestedFixSchema.safeParse({
        kind: "replace",
        span: { section: "findings", start: 5, end: 2, quote: "" },
        text: "x",
      }).success,
    ).toBe(false);
  });

  it("only open blocking issues block signing", () => {
    expect(isBlockingOpen({ severity: "blocking", resolved: false })).toBe(true);
    expect(isBlockingOpen({ severity: "blocking", resolved: true })).toBe(false);
    expect(isBlockingOpen({ severity: "warning", resolved: false })).toBe(false);
  });
});
