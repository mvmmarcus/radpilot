import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { exportReportAsFhir } from "./exportFhir";
import { createFakeSupabase } from "./testSupabase";

// Fixtures mirror the seeded study 4 / report 4 (supabase/seed.sql).
const patientRow = {
  id: "10000000-0000-4000-8000-000000000004",
  mrn: "RP-100004",
  full_name: "Laura Mitchell",
  sex: "F",
  birth_date: "1980-01-15",
};

const studyRow = {
  id: "20000000-0000-4000-8000-000000000004",
  accession: "RP26000004",
  patient_id: patientRow.id,
  modality: "CR",
  body_part: "chest",
  description: "XR chest, PA and lateral",
  indication: "Preoperative evaluation before elective laparoscopic cholecystectomy.",
  priority: "routine",
  status: "final",
  study_date: "2026-09-30T10:00:00+00:00",
  dicom_path: "cr-chest-normal",
  assigned_to: "a0000000-0000-4000-8000-000000000001",
};

const templateRow = {
  id: "30000000-0000-4000-8000-000000000004",
  slug: "cr-chest",
  name: "Chest Radiograph",
  modality: "CR",
  body_part: "chest",
  sections: [
    { key: "clinical_indication", label: "Clinical indication", required: true, aiAssisted: false },
    { key: "technique", label: "Technique", required: true, aiAssisted: true },
    { key: "comparison", label: "Comparison", required: true, aiAssisted: false },
    { key: "findings", label: "Findings", required: true, aiAssisted: true },
    { key: "impression", label: "Impression", required: true, aiAssisted: true },
    { key: "recommendations", label: "Recommendations", required: false, aiAssisted: true },
  ],
  macros: [],
  normal_text: {},
};

const content = {
  schemaVersion: 1,
  sections: {
    clinical_indication: {
      text: "Preoperative evaluation before elective laparoscopic cholecystectomy.",
      source: "template",
      ai: null,
    },
    technique: { text: "PA and lateral views of the chest.", source: "template", ai: null },
    comparison: { text: "None.", source: "template", ai: null },
    findings: {
      text: "Lungs: Clear. No focal consolidation.",
      source: "template",
      ai: null,
    },
    impression: { text: "No acute cardiopulmonary abnormality.", source: "template", ai: null },
    recommendations: { text: "", source: "human", ai: null },
  },
};

function reportRow(status: "draft" | "preliminary" | "final" | "amended") {
  return {
    id: "40000000-0000-4000-8000-000000000004",
    study_id: studyRow.id,
    template_id: templateRow.id,
    status,
    content,
    is_critical: false,
    version: 2,
    created_by: "a0000000-0000-4000-8000-000000000001",
    signed_by: status === "final" || status === "amended" ? "a0000000-0000-4000-8000-000000000001" : null,
    signed_at: status === "final" || status === "amended" ? "2026-09-30T14:00:00+00:00" : null,
    created_at: "2026-09-30T13:00:00+00:00",
    updated_at: "2026-09-30T14:00:00+00:00",
  };
}

function fakeClient(reports: ReturnType<typeof reportRow>[]) {
  return createFakeSupabase({
    reports,
    studies: [studyRow],
    templates: [templateRow],
    patients: [patientRow],
  }) as unknown as SupabaseClient<Database>;
}

describe("exportReportAsFhir", () => {
  it("returns not_found for an unknown report id", async () => {
    const result = await exportReportAsFhir(fakeClient([]), "40000000-0000-4000-8000-000000000004");
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("returns not_exportable for a draft or preliminary report", async () => {
    const draftResult = await exportReportAsFhir(fakeClient([reportRow("draft")]), reportRow("draft").id);
    expect(draftResult).toEqual({ ok: false, reason: "not_exportable", status: "draft" });

    const preliminaryResult = await exportReportAsFhir(
      fakeClient([reportRow("preliminary")]),
      reportRow("preliminary").id,
    );
    expect(preliminaryResult).toEqual({ ok: false, reason: "not_exportable", status: "preliminary" });
  });

  it("exports a valid FHIR Bundle for the seeded final report (study 4)", async () => {
    const final = reportRow("final");
    const result = await exportReportAsFhir(fakeClient([final]), final.id);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.bundle.resourceType).toBe("Bundle");
    const diagnosticReport = result.bundle.entry.find((e) => e.resource.resourceType === "DiagnosticReport")?.resource;
    if (diagnosticReport?.resourceType !== "DiagnosticReport") throw new Error("expected DiagnosticReport");
    expect(diagnosticReport.status).toBe("final");
    expect(diagnosticReport.conclusion).toBe("No acute cardiopulmonary abnormality.");
    expect(diagnosticReport.identifier[0]).toEqual({
      system: "https://radpilot.example/accession",
      value: "RP26000004",
    });
  });

  it("also exports amended reports", async () => {
    const amended = reportRow("amended");
    const result = await exportReportAsFhir(fakeClient([amended]), amended.id);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    const diagnosticReport = result.bundle.entry[0].resource;
    if (diagnosticReport.resourceType !== "DiagnosticReport") throw new Error("expected DiagnosticReport");
    expect(diagnosticReport.status).toBe("amended");
  });
});
