import { describe, expect, it } from "vitest";
import { pendingAiSections } from "../domain/content";
import { isEditable } from "../domain/status";
import { toContentJson, toReport, toReportVersion, type ReportRow, type ReportVersionRow } from "./mappers";

const content = {
  schemaVersion: 1,
  sections: {
    findings: { text: "Lungs: Clear.", source: "template", ai: null },
    impression: {
      text: "No acute cardiopulmonary abnormality.",
      source: "ai",
      ai: { generationId: "50000000-0000-4000-8000-000000000001", review: "pending" },
    },
  },
};

const reportRow: ReportRow = {
  id: "40000000-0000-4000-8000-000000000004",
  study_id: "20000000-0000-4000-8000-000000000004",
  template_id: "30000000-0000-4000-8000-000000000004",
  status: "final",
  content,
  is_critical: false,
  version: 3,
  created_by: "a0000000-0000-4000-8000-000000000001",
  signed_by: "a0000000-0000-4000-8000-000000000001",
  signed_at: "2026-10-01T09:15:00.654321+00:00",
  created_at: "2026-10-01T08:00:00+00:00",
  updated_at: "2026-10-01T09:15:00.654321+00:00",
};

describe("reports mappers", () => {
  it("maps a report row, parsing the content with ReportContentSchema", () => {
    const report = toReport(reportRow);
    expect(report).toMatchObject({
      studyId: reportRow.study_id,
      templateId: reportRow.template_id,
      isCritical: false,
      version: 3,
      signedAt: "2026-10-01T09:15:00.654Z",
      createdAt: "2026-10-01T08:00:00.000Z",
    });
    expect(isEditable(report.status)).toBe(false);
    expect(pendingAiSections(report.content)).toEqual(["impression"]);
  });

  it("keeps nulls for unsigned drafts", () => {
    const draft = toReport({ ...reportRow, status: "draft", signed_by: null, signed_at: null });
    expect(draft.signedBy).toBeNull();
    expect(draft.signedAt).toBeNull();
  });

  it("rejects content that is not ReportContent", () => {
    expect(() => toReport({ ...reportRow, content: { schemaVersion: 2, sections: {} } })).toThrow(/reports\/40000000/);
    expect(() =>
      toReport({ ...reportRow, content: { schemaVersion: 1, sections: { summary: { text: "" } } } }),
    ).toThrow();
  });

  it("maps a report version row", () => {
    const row: ReportVersionRow = {
      id: "41000000-0000-4000-8000-000000000001",
      report_id: reportRow.id,
      version: 1,
      status: "final",
      content,
      created_by: null,
      created_at: "2026-10-01T09:15:00+00:00",
    };
    expect(toReportVersion(row)).toMatchObject({ reportId: reportRow.id, version: 1, createdBy: null });
  });

  it("round-trips content through the jsonb helper", () => {
    const report = toReport(reportRow);
    expect(toReport({ ...reportRow, content: toContentJson(report.content) }).content).toEqual(report.content);
  });
});
