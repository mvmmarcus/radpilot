import type { Json, Tables } from "@/lib/supabase/database.types";
import { parseRow, toIsoDateTime, toIsoDateTimeOrNull } from "@/lib/supabase/mapping";
import type { ReportContent } from "../domain/content";
import { ReportSchema, ReportVersionSchema, type Report, type ReportVersion } from "../domain/report";

export type ReportRow = Tables<"reports">;
export type ReportVersionRow = Tables<"report_versions">;

export function toReport(row: ReportRow): Report {
  return parseRow(
    ReportSchema,
    {
      id: row.id,
      studyId: row.study_id,
      templateId: row.template_id,
      status: row.status,
      content: row.content,
      isCritical: row.is_critical,
      version: row.version,
      createdBy: row.created_by,
      signedBy: row.signed_by,
      signedAt: toIsoDateTimeOrNull(row.signed_at),
      createdAt: toIsoDateTime(row.created_at),
      updatedAt: toIsoDateTime(row.updated_at),
    },
    "reports",
    row.id,
  );
}

export function toReportVersion(row: ReportVersionRow): ReportVersion {
  return parseRow(
    ReportVersionSchema,
    {
      id: row.id,
      reportId: row.report_id,
      version: row.version,
      status: row.status,
      content: row.content,
      createdBy: row.created_by,
      createdAt: toIsoDateTime(row.created_at),
    },
    "report_versions",
    row.id,
  );
}

/** ReportContent for a jsonb column (insert/update payloads). */
export function toContentJson(content: ReportContent): Json {
  return content as Json;
}
