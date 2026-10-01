import type { Template } from "@/modules/templates";
import { createReportContent } from "../domain/content";
import type { Report } from "../domain/report";
import type { ReportRepository } from "./repository";

export interface CreateReportForStudyInput {
  studyId: string;
  template: Pick<Template, "id" | "sections">;
  indication: string;
  createdBy: string | null;
  /** Injected for deterministic tests; defaults to crypto.randomUUID(). */
  id?: string;
}

/**
 * Creates the report row for a study from its template (idempotent: returns
 * the existing report if one is already there, since reports.study_id is
 * unique and a race would otherwise throw a duplicate-key error).
 */
export async function createReport(repository: ReportRepository, input: CreateReportForStudyInput): Promise<Report> {
  const existing = await repository.getReportByStudy(input.studyId);
  if (existing) return existing;

  const content = createReportContent(input.template, { indication: input.indication });
  return repository.createReport({
    id: input.id ?? crypto.randomUUID(),
    studyId: input.studyId,
    templateId: input.template.id,
    content,
    createdBy: input.createdBy,
  });
}
