import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { toReport, type ReportRow } from "@/modules/reports/server";
import { toStudy, toPatient, type StudyRow, type PatientRow } from "@/modules/studies/server";
import { toTemplate, type TemplateRow } from "@/modules/templates/server";
import { toFhirBundle, validateFhirBundle, type FhirBundle } from "../domain/fhir";

export const FHIR_EXPORTABLE_STATUSES = ["final", "amended"] as const;

export type FhirExportResult =
  | { ok: true; bundle: FhirBundle }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "not_exportable"; status: string };

/**
 * Load a report (with its study, patient and template) and map it to a FHIR
 * R4 Bundle. Only reports with status "final" or "amended" are exportable;
 * everything else is reported back as `not_exportable` so the route handler
 * can return 404 without leaking draft content.
 */
export async function exportReportAsFhir(
  supabase: SupabaseClient<Database>,
  reportId: string,
): Promise<FhirExportResult> {
  const { data: reportRow, error: reportError } = await supabase
    .from("reports")
    .select("*")
    .eq("id", reportId)
    .maybeSingle();
  if (reportError) throw reportError;
  if (!reportRow) return { ok: false, reason: "not_found" };

  if (!FHIR_EXPORTABLE_STATUSES.includes(reportRow.status as (typeof FHIR_EXPORTABLE_STATUSES)[number])) {
    return { ok: false, reason: "not_exportable", status: reportRow.status };
  }

  const [{ data: studyRow, error: studyError }, { data: templateRow, error: templateError }] = await Promise.all([
    supabase.from("studies").select("*").eq("id", reportRow.study_id).maybeSingle(),
    supabase.from("templates").select("*").eq("id", reportRow.template_id).maybeSingle(),
  ]);
  if (studyError) throw studyError;
  if (templateError) throw templateError;
  if (!studyRow) throw new Error(`Report ${reportId} references missing study ${reportRow.study_id}`);
  if (!templateRow) throw new Error(`Report ${reportId} references missing template ${reportRow.template_id}`);

  const { data: patientRow, error: patientError } = await supabase
    .from("patients")
    .select("*")
    .eq("id", studyRow.patient_id)
    .maybeSingle();
  if (patientError) throw patientError;
  if (!patientRow) throw new Error(`Study ${studyRow.id} references missing patient ${studyRow.patient_id}`);

  const report = toReport(reportRow as ReportRow);
  const study = toStudy(studyRow as StudyRow);
  const patient = toPatient(patientRow as PatientRow);
  const template = toTemplate(templateRow as TemplateRow);

  const bundle = toFhirBundle({ report, study, patient, template });
  const validation = validateFhirBundle(bundle);
  if (!validation.valid) {
    throw new Error(
      `FHIR bundle for report ${reportId} failed structural validation: ${validation.issues
        .map((i) => `${i.path}: ${i.message}`)
        .join("; ")}`,
    );
  }

  return { ok: true, bundle };
}
