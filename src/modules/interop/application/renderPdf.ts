import type { SupabaseClient } from "@supabase/supabase-js";
import { renderToBuffer } from "@react-pdf/renderer";
import type { Database } from "@/lib/supabase/database.types";
import { toReport, type ReportRow } from "@/modules/reports/server";
import { toStudy, toPatient, type StudyRow, type PatientRow } from "@/modules/studies/server";
import { toTemplate, type TemplateRow } from "@/modules/templates/server";
import { ReportPdfDocument } from "./ReportPdfDocument";

export type ReportPdfResult =
  | { ok: true; buffer: Buffer; fileName: string }
  | { ok: false; reason: "not_found" };

export function reportPdfFileName(accession: string): string {
  return `${accession}.pdf`;
}

/**
 * Load a report (any status: a draft can be previewed) with its study,
 * patient, template and signer, and render it to a PDF buffer.
 */
export async function buildReportPdf(
  supabase: SupabaseClient<Database>,
  reportId: string,
): Promise<ReportPdfResult> {
  const { data: reportRow, error: reportError } = await supabase
    .from("reports")
    .select("*")
    .eq("id", reportId)
    .maybeSingle();
  if (reportError) throw reportError;
  if (!reportRow) return { ok: false, reason: "not_found" };

  const [{ data: studyRow, error: studyError }, { data: templateRow, error: templateError }] = await Promise.all([
    supabase.from("studies").select("*").eq("id", reportRow.study_id).maybeSingle(),
    supabase.from("templates").select("*").eq("id", reportRow.template_id).maybeSingle(),
  ]);
  if (studyError) throw studyError;
  if (templateError) throw templateError;
  if (!studyRow) throw new Error(`Report ${reportId} references missing study ${reportRow.study_id}`);
  if (!templateRow) throw new Error(`Report ${reportId} references missing template ${reportRow.template_id}`);

  const [{ data: patientRow, error: patientError }, { data: signerRow, error: signerError }] = await Promise.all([
    supabase.from("patients").select("*").eq("id", studyRow.patient_id).maybeSingle(),
    reportRow.signed_by
      ? supabase.from("profiles").select("full_name").eq("id", reportRow.signed_by).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (patientError) throw patientError;
  if (signerError) throw signerError;
  if (!patientRow) throw new Error(`Study ${studyRow.id} references missing patient ${studyRow.patient_id}`);

  const report = toReport(reportRow as ReportRow);
  const study = toStudy(studyRow as StudyRow);
  const patient = toPatient(patientRow as PatientRow);
  const template = toTemplate(templateRow as TemplateRow);
  const signedByName = signerRow?.full_name ?? null;

  const buffer = await renderToBuffer(
    ReportPdfDocument({ report, study, patient, template, signedByName }),
  );

  return { ok: true, buffer, fileName: reportPdfFileName(study.accession) };
}
