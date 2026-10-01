import { describe, expect, it } from "vitest";
import { createReportContent, editSection } from "../domain/content";
import type { Report } from "../domain/report";
import type { CreateReportInput, ReportRepository } from "./repository";
import { ReportVersionConflictError } from "./repository";
import { saveReportContent } from "./save-report-content";

const template = {
  sections: [{ key: "findings" as const, label: "Findings", required: true, aiAssisted: true }],
};

class InMemoryReportRepository implements ReportRepository {
  reports = new Map<string, Report>();

  async getReport(id: string): Promise<Report | null> {
    return this.reports.get(id) ?? null;
  }
  async getReportByStudy(): Promise<Report | null> {
    return null;
  }
  async createReport(input: CreateReportInput): Promise<Report> {
    const report: Report = {
      id: input.id,
      studyId: input.studyId,
      templateId: input.templateId,
      status: "draft",
      content: input.content,
      isCritical: false,
      version: 1,
      createdBy: input.createdBy,
      signedBy: null,
      signedAt: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    };
    this.reports.set(report.id, report);
    return report;
  }
  async saveContent(id: string, expectedVersion: number, content: Report["content"]): Promise<Report> {
    const existing = this.reports.get(id);
    if (!existing) throw new Error("not found");
    if (existing.version !== expectedVersion) throw new ReportVersionConflictError(id);
    const updated = { ...existing, content, version: existing.version + 1 };
    this.reports.set(id, updated);
    return updated;
  }
}

describe("saveReportContent", () => {
  it("saves and bumps the version on a matching expected version", async () => {
    const repo = new InMemoryReportRepository();
    const content = createReportContent(template, { indication: "x" });
    const created = await repo.createReport({ id: "r1", studyId: "s1", templateId: "t1", content, createdBy: null });

    const edited = editSection(content, "findings", "Clear lungs.");
    const saved = await saveReportContent(repo, created.id, created.version, edited);

    expect(saved.version).toBe(2);
    expect(saved.content.sections.findings?.text).toBe("Clear lungs.");
  });

  it("throws ReportVersionConflictError on a stale version (optimistic concurrency)", async () => {
    const repo = new InMemoryReportRepository();
    const content = createReportContent(template, { indication: "x" });
    const created = await repo.createReport({ id: "r1", studyId: "s1", templateId: "t1", content, createdBy: null });

    await saveReportContent(repo, created.id, created.version, editSection(content, "findings", "First edit."));

    await expect(
      saveReportContent(repo, created.id, created.version /* stale: already bumped to 2 */, editSection(content, "findings", "Conflicting edit.")),
    ).rejects.toThrow(ReportVersionConflictError);
  });
});
