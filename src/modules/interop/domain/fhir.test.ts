import { describe, expect, it } from "vitest";
import type { Patient, Study } from "@/modules/studies";
import type { Report } from "@/modules/reports";
import type { Template } from "@/modules/templates";
import { reportPlainText, toFhirBundle, validateFhirBundle, type FhirBundle } from "./fhir";

// Fixtures mirror the seeded study 4 / report 4 (supabase/seed.sql): a signed,
// normal CR chest report. Ids are shortened but keep the uuid shape.
const patient: Patient = {
  id: "10000000-0000-4000-8000-000000000004",
  mrn: "RP-100004",
  fullName: "Laura Mitchell",
  sex: "F",
  birthDate: "1980-01-15",
};

const study: Study = {
  id: "20000000-0000-4000-8000-000000000004",
  accession: "RP26000004",
  patientId: patient.id,
  modality: "CR",
  bodyPart: "chest",
  description: "XR chest, PA and lateral",
  indication: "Preoperative evaluation before elective laparoscopic cholecystectomy.",
  priority: "routine",
  status: "final",
  studyDate: "2026-09-30T10:00:00.000Z",
  dicomPath: "cr-chest-normal",
  assignedTo: "a0000000-0000-4000-8000-000000000001",
};

const template: Pick<Template, "sections"> = {
  sections: [
    { key: "clinical_indication", label: "Clinical indication", required: true, aiAssisted: false },
    { key: "technique", label: "Technique", required: true, aiAssisted: true },
    { key: "comparison", label: "Comparison", required: true, aiAssisted: false },
    { key: "findings", label: "Findings", required: true, aiAssisted: true },
    { key: "impression", label: "Impression", required: true, aiAssisted: true },
    { key: "recommendations", label: "Recommendations", required: false, aiAssisted: true },
  ],
};

const report: Report = {
  id: "40000000-0000-4000-8000-000000000004",
  studyId: study.id,
  templateId: "30000000-0000-4000-8000-000000000004",
  status: "final",
  content: {
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
        text:
          "Lines and tubes: None.\nLungs: Clear. No focal consolidation.\nPleura: No pleural effusion or pneumothorax.\nHeart and mediastinum: Normal cardiomediastinal silhouette.\nBones: No acute osseous abnormality.",
        source: "template",
        ai: null,
      },
      impression: { text: "No acute cardiopulmonary abnormality.", source: "template", ai: null },
      recommendations: { text: "", source: "human", ai: null },
    },
  },
  isCritical: false,
  version: 2,
  createdBy: "a0000000-0000-4000-8000-000000000001",
  signedBy: "a0000000-0000-4000-8000-000000000001",
  signedAt: "2026-09-30T14:00:00.000Z",
  createdAt: "2026-09-30T13:00:00.000Z",
  updatedAt: "2026-09-30T14:00:00.000Z",
};

describe("toFhirBundle", () => {
  it("maps a final report to a valid FHIR R4 Bundle (snapshot)", () => {
    const bundle = toFhirBundle({ report, study, patient, template });
    // timestamp is generated at call time; normalize it for the snapshot.
    const normalized: FhirBundle = { ...bundle, timestamp: "<generated>" };
    expect(normalized).toMatchSnapshot();
  });

  it("sets DiagnosticReport.status from the report status (final -> final, amended -> amended)", () => {
    const finalBundle = toFhirBundle({ report, study, patient, template });
    const [{ resource: finalResource }] = finalBundle.entry;
    if (finalResource.resourceType !== "DiagnosticReport") throw new Error("expected DiagnosticReport");
    expect(finalResource.status).toBe("final");

    const amended = toFhirBundle({ report: { ...report, status: "amended" }, study, patient, template });
    const amendedResource = amended.entry[0].resource;
    if (amendedResource.resourceType !== "DiagnosticReport") throw new Error("expected DiagnosticReport");
    expect(amendedResource.status).toBe("amended");
  });

  it("rejects draft and preliminary reports", () => {
    expect(() => toFhirBundle({ report: { ...report, status: "draft" }, study, patient, template })).toThrow(
      /only final or amended/,
    );
    expect(() => toFhirBundle({ report: { ...report, status: "preliminary" }, study, patient, template })).toThrow(
      /only final or amended/,
    );
  });

  it("sets conclusion from the impression and emits one Observation per impression item", () => {
    const twoLineReport: Report = {
      ...report,
      content: {
        ...report.content,
        sections: {
          ...report.content.sections,
          impression: {
            text: "1. No acute cardiopulmonary abnormality.\n2. Stable cardiomegaly.",
            source: "template",
            ai: null,
          },
        },
      },
    };
    const bundle = toFhirBundle({ report: twoLineReport, study, patient, template });
    const diagnosticReport = bundle.entry[0].resource;
    if (diagnosticReport.resourceType !== "DiagnosticReport") throw new Error("expected DiagnosticReport");
    expect(diagnosticReport.conclusion).toBe("No acute cardiopulmonary abnormality. Stable cardiomegaly.");

    const observations = bundle.entry.filter((e) => e.resource.resourceType === "Observation");
    expect(observations).toHaveLength(2);
    expect(observations.map((o) => (o.resource as { valueString: string }).valueString)).toEqual([
      "No acute cardiopulmonary abnormality.",
      "Stable cardiomegaly.",
    ]);
    expect(diagnosticReport.result).toEqual(observations.map((o) => ({ reference: o.fullUrl })));
  });

  it("base64-encodes a text/plain presentedForm with the report body in template section order", () => {
    const bundle = toFhirBundle({ report, study, patient, template });
    const diagnosticReport = bundle.entry[0].resource;
    if (diagnosticReport.resourceType !== "DiagnosticReport") throw new Error("expected DiagnosticReport");
    const [form] = diagnosticReport.presentedForm;
    expect(form.contentType).toBe("text/plain");
    const decoded = Buffer.from(form.data, "base64").toString("utf-8");
    expect(decoded).toBe(reportPlainText(report.content, template));
    expect(decoded.indexOf("Clinical indication")).toBeLessThan(decoded.indexOf("Findings"));
    expect(decoded.indexOf("Findings")).toBeLessThan(decoded.indexOf("Impression"));
  });

  it("picks a LOINC code from modality + body part, falling back to a generic code", () => {
    const bundle = toFhirBundle({ report, study, patient, template });
    const diagnosticReport = bundle.entry[0].resource;
    if (diagnosticReport.resourceType !== "DiagnosticReport") throw new Error("expected DiagnosticReport");
    expect(diagnosticReport.code.coding[0]).toEqual({ system: "http://loinc.org", code: "36643-5", display: "XR Chest" });

    const mrStudy: Study = { ...study, modality: "MR", bodyPart: "head" };
    const fallback = toFhirBundle({ report, study: mrStudy, patient, template });
    const fallbackReport = fallback.entry[0].resource;
    if (fallbackReport.resourceType !== "DiagnosticReport") throw new Error("expected DiagnosticReport");
    expect(fallbackReport.code.coding[0].code).toBe("18748-4");
  });
});

describe("validateFhirBundle", () => {
  it("accepts a bundle produced by toFhirBundle", () => {
    const bundle = toFhirBundle({ report, study, patient, template });
    expect(validateFhirBundle(bundle)).toEqual({ valid: true, issues: [] });
  });

  it("rejects a bundle missing a DiagnosticReport", () => {
    const result = validateFhirBundle({
      resourceType: "Bundle",
      type: "collection",
      timestamp: new Date().toISOString(),
      entry: [
        {
          fullUrl: "urn:uuid:obs-1",
          resource: {
            resourceType: "Observation",
            id: "obs-1",
            status: "final",
            category: [],
            code: { coding: [{ code: "x" }] },
            subject: { reference: "urn:uuid:p" },
            valueString: "ok",
          },
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("exactly one DiagnosticReport"))).toBe(true);
  });

  it("rejects a result reference that does not resolve within the bundle", () => {
    const bundle = toFhirBundle({ report, study, patient, template });
    const diagnosticReport = bundle.entry[0].resource;
    if (diagnosticReport.resourceType !== "DiagnosticReport") throw new Error("expected DiagnosticReport");
    const broken: FhirBundle = {
      ...bundle,
      entry: [
        { ...bundle.entry[0], resource: { ...diagnosticReport, result: [{ reference: "urn:uuid:missing" }] } },
        ...bundle.entry.slice(1),
      ],
    };
    const result = validateFhirBundle(broken);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("does not resolve"))).toBe(true);
  });
});
