import { describe, expect, it } from "vitest";
import { isBlockingOpen, type CopilotIssueDraft } from "../domain/issue";
import { toCopilotIssue, toCopilotIssueInsert, type CopilotIssueRow } from "./mappers";

const reportId = "40000000-0000-4000-8000-000000000001";

const row: CopilotIssueRow = {
  id: "60000000-0000-4000-8000-000000000001",
  report_id: reportId,
  source: "rule",
  rule_id: "laterality-conflict",
  severity: "blocking",
  category: "laterality",
  message: "Indication says left, findings say right.",
  span: { section: "findings", start: 0, end: 5, quote: "Right" },
  suggested_fix: {
    kind: "replace",
    span: { section: "findings", start: 0, end: 5, quote: "Right" },
    text: "Left",
  },
  resolved: false,
  resolved_by: null,
  resolved_at: null,
  created_at: "2026-10-01T10:00:00.000001+00:00",
};

describe("copilot mappers", () => {
  it("maps an issue row, including span and suggested fix", () => {
    const issue = toCopilotIssue(row);
    expect(issue).toMatchObject({
      reportId,
      ruleId: "laterality-conflict",
      span: { section: "findings", quote: "Right" },
      suggestedFix: { kind: "replace", text: "Left" },
      createdAt: "2026-10-01T10:00:00.000Z",
    });
    expect(isBlockingOpen(issue)).toBe(true);
  });

  it("maps LLM issues without span or fix", () => {
    const issue = toCopilotIssue({ ...row, source: "llm", rule_id: null, severity: "info", span: null, suggested_fix: null });
    expect(issue.span).toBeNull();
    expect(issue.suggestedFix).toBeNull();
    expect(isBlockingOpen(issue)).toBe(false);
  });

  it("rejects a malformed suggested fix", () => {
    expect(() => toCopilotIssue({ ...row, suggested_fix: { kind: "delete" } })).toThrow(/copilot_issues\/60000000/);
  });

  it("builds an insert payload from a draft, and the row maps back to the same issue", () => {
    const draft: CopilotIssueDraft = {
      source: "guideline",
      ruleId: "fleischner-2017",
      severity: "warning",
      category: "guideline",
      message: "Solid nodule 6-8 mm in a high-risk patient: CT at 6-12 months.",
      span: null,
      suggestedFix: { kind: "append", section: "recommendations", text: "CT chest in 6-12 months." },
    };
    const insert = toCopilotIssueInsert(reportId, draft);
    expect(insert).toEqual({
      report_id: reportId,
      source: "guideline",
      rule_id: "fleischner-2017",
      severity: "warning",
      category: "guideline",
      message: draft.message,
      span: null,
      suggested_fix: draft.suggestedFix,
    });
    const roundTrip = toCopilotIssue({
      ...row,
      ...insert,
      rule_id: insert.rule_id ?? null,
      span: insert.span ?? null,
      suggested_fix: insert.suggested_fix ?? null,
    });
    expect(roundTrip).toMatchObject(draft);
  });
});
