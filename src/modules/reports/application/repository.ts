import type { ReportContent } from "../domain/content";
import type { Report } from "../domain/report";

export interface CreateReportInput {
  id: string;
  studyId: string;
  templateId: string;
  content: ReportContent;
  createdBy: string | null;
}

/** Thrown by `save` when the version passed does not match the row in the database. */
export class ReportVersionConflictError extends Error {
  constructor(readonly reportId: string) {
    super(`Report ${reportId} was changed by someone else. Reload before saving again.`);
    this.name = "ReportVersionConflictError";
  }
}

/**
 * Port for creating and autosaving report content. The Supabase
 * implementation uses `... where id = $1 and version = $2` for optimistic
 * concurrency (reports.version is bumped by trigger on every update).
 */
export interface ReportRepository {
  getReport(id: string): Promise<Report | null>;
  getReportByStudy(studyId: string): Promise<Report | null>;
  createReport(input: CreateReportInput): Promise<Report>;
  /** Throws ReportVersionConflictError if `expectedVersion` is stale. Returns the saved row (new version). */
  saveContent(id: string, expectedVersion: number, content: ReportContent): Promise<Report>;
}
