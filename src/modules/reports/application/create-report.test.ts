import { describe, expect, it } from "vitest";
import type { Template } from "@/modules/templates";
import { createReportContent } from "../domain/content";
import type { Report } from "../domain/report";
import { createReport } from "./create-report";
import type { CreateReportInput, ReportRepository } from "./repository";
import { ReportVersionConflictError } from "./repository";

const template: Pick<Template, "id" | "sections"> = {
  id: "30000000-0000-4000-8000-000000000001",
  sections: [
    { key: "clinical_indication", label: "Clinical indication", required: true, aiAssisted: false },
    { key: "findings", label: "Findings", required: true, aiAssisted: true },
    { key: "impression", label: "Impression", required: true, aiAssisted: true },
  ],
};

class InMemoryReportRepository implements ReportRepository {
  reports = new Map<string, Report>();

  async getReport(id: string): Promise<Report | null> {
    return this.reports.get(id) ?? null;
  }
  async getReportByStudy(studyId: string): Promise<Report | null> {
    return [...this.reports.values()].find((r) => r.studyId === studyId) ?? null;
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

describe("createReport", () => {
  it("creates a report whose content matches createReportContent", async () => {
    const repo = new InMemoryReportRepository();
    const report = await createReport(repo, {
      studyId: "20000000-0000-4000-8000-000000000001",
      template,
      indication: "Suspected PE",
      createdBy: "a0000000-0000-4000-8000-000000000001",
      id: "40000000-0000-4000-8000-000000000001",
    });

    expect(report.content).toEqual(createReportContent(template, { indication: "Suspected PE" }));
    expect(report.status).toBe("draft");
    expect(report.version).toBe(1);
  });

  it("is idempotent: returns the existing report instead of creating a duplicate", async () => {
    const repo = new InMemoryReportRepository();
    const first = await createReport(repo, {
      studyId: "20000000-0000-4000-8000-000000000001",
      template,
      indication: "Suspected PE",
      createdBy: null,
    });
    const second = await createReport(repo, {
      studyId: "20000000-0000-4000-8000-000000000001",
      template,
      indication: "Different indication, should be ignored",
      createdBy: null,
    });

    expect(second.id).toBe(first.id);
    expect(repo.reports.size).toBe(1);
  });
});
