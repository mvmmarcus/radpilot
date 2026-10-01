import type { ReportContent } from "../domain/content";
import type { Report } from "../domain/report";
import type { ReportRepository } from "./repository";

/**
 * Autosave. Thin wrapper over ReportRepository.saveContent so the editor has
 * one call to make; throws ReportVersionConflictError on a stale version,
 * which the UI surfaces as "reload, someone else is editing".
 */
export async function saveReportContent(
  repository: ReportRepository,
  reportId: string,
  expectedVersion: number,
  content: ReportContent,
): Promise<Report> {
  return repository.saveContent(reportId, expectedVersion, content);
}
