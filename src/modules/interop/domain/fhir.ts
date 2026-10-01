import type { Patient, Study } from "@/modules/studies";
import { ageSexLabel } from "@/modules/studies";
import { SECTION_KEYS, SECTION_LABELS, type Template } from "@/modules/templates";
import { sectionItems, type ReportContent } from "@/modules/reports";
import type { Report } from "@/modules/reports";

/**
 * Pure mapper: Report + Study + Patient + Template -> a FHIR R4 Bundle
 * (DiagnosticReport + Observations). See docs/adr (FHIR export) if present.
 *
 * Scope: only the fields RadPilot actually has. This is not a general FHIR
 * client; it is a one-way, read-only export of a signed report.
 */

// --- LOINC / coding tables ---------------------------------------------------

/**
 * LOINC codes for "<modality> study of <body part>", chosen to be reasonable
 * and stable for the demo; not a claim of full LOINC coverage.
 */
const REPORT_CODE: Record<Study["modality"], Partial<Record<Study["bodyPart"], { code: string; display: string }>>> = {
  CT: {
    chest: { code: "30746-2", display: "CT Chest" },
    head: { code: "30799-1", display: "CT Head" },
    abdomen_pelvis: { code: "30797-5", display: "CT Abdomen and Pelvis" },
  },
  CR: {
    chest: { code: "36643-5", display: "XR Chest" },
  },
  US: {
    thyroid: { code: "47069-0", display: "US Thyroid" },
  },
  MG: {
    breast: { code: "36319-2", display: "Mammography" },
  },
  MR: {},
};

const DEFAULT_REPORT_CODE = { code: "18748-4", display: "Diagnostic imaging study" };

/** DiagnosticReport.status: only final/amended reports are exportable. */
const REPORT_STATUS_MAP: Partial<Record<Report["status"], "final" | "amended">> = {
  final: "final",
  amended: "amended",
};

const SEX_MAP: Record<Patient["sex"], "male" | "female" | "other" | "unknown"> = {
  M: "male",
  F: "female",
  O: "other",
  U: "unknown",
};

// --- FHIR R4 shapes (the subset this mapper produces) -----------------------

export interface FhirCoding {
  system?: string;
  code: string;
  display?: string;
}

export interface FhirCodeableConcept {
  coding: FhirCoding[];
  text?: string;
}

export interface FhirReference {
  reference?: string;
  display?: string;
}

export interface FhirIdentifier {
  system?: string;
  value: string;
}

export interface FhirAttachment {
  contentType: string;
  /** Base64-encoded content. */
  data: string;
  title?: string;
}

export interface FhirObservation {
  resourceType: "Observation";
  id: string;
  status: "final" | "amended";
  category: FhirCodeableConcept[];
  code: FhirCodeableConcept;
  subject: FhirReference;
  valueString: string;
}

export interface FhirPatient {
  resourceType: "Patient";
  id: string;
  identifier: FhirIdentifier[];
  name: { text: string }[];
  gender: "male" | "female" | "other" | "unknown";
  birthDate: string;
}

export interface FhirDiagnosticReport {
  resourceType: "DiagnosticReport";
  id: string;
  status: "final" | "amended";
  identifier: FhirIdentifier[];
  code: FhirCodeableConcept;
  subject: FhirReference;
  effectiveDateTime: string;
  issued: string;
  conclusion: string;
  presentedForm: FhirAttachment[];
  result: FhirReference[];
}

export interface FhirBundleEntry {
  fullUrl: string;
  resource: FhirDiagnosticReport | FhirObservation | FhirPatient;
}

export interface FhirBundle {
  resourceType: "Bundle";
  type: "collection";
  timestamp: string;
  entry: FhirBundleEntry[];
}

export interface FhirMapperInput {
  report: Report;
  study: Study;
  patient: Patient;
  template: Pick<Template, "sections">;
}

function reportCodeFor(study: Pick<Study, "modality" | "bodyPart">): { code: string; display: string } {
  return REPORT_CODE[study.modality]?.[study.bodyPart] ?? DEFAULT_REPORT_CODE;
}

function base64Encode(text: string): string {
  // Buffer is available in Node (route handlers run server-side); avoid btoa's
  // Latin1-only restriction so the plain-text report body may contain any UTF-8.
  return Buffer.from(text, "utf-8").toString("base64");
}

/** Plain-text rendering of the report content, in template section order. */
export function reportPlainText(content: ReportContent, template: Pick<Template, "sections">): string {
  const order = template.sections.map((s) => s.key);
  const keys = SECTION_KEYS.filter((k) => order.includes(k));
  return keys
    .map((key) => {
      const section = content.sections[key];
      if (!section?.text.trim()) return null;
      return `${SECTION_LABELS[key]}:\n${section.text.trim()}`;
    })
    .filter((v): v is string => v !== null)
    .join("\n\n");
}

/**
 * Map a signed (final/amended) report to a FHIR R4 Bundle: one DiagnosticReport
 * plus one Observation per finding (impression items, one per line).
 *
 * Throws if the report status is not final or amended: this mapper is only
 * for signed reports, matching the export gate at GET /api/fhir/DiagnosticReport/[id].
 */
export function toFhirBundle(input: FhirMapperInput): FhirBundle {
  const { report, study, patient, template } = input;
  const status = REPORT_STATUS_MAP[report.status];
  if (!status) {
    throw new Error(`Report ${report.id} has status "${report.status}"; only final or amended reports can be exported.`);
  }

  const reportFullUrl = `urn:uuid:${report.id}`;
  const patientFullUrl = `urn:uuid:${patient.id}`;
  const patientReference: FhirReference = { reference: patientFullUrl, display: `${patient.fullName} (${ageSexLabel(patient)})` };
  const code = reportCodeFor(study);
  const impressionItems = sectionItems(report.content, "impression");
  const findingsItems = sectionItems(report.content, "findings");
  const observationItems = impressionItems.length > 0 ? impressionItems : findingsItems;

  const patientResource: FhirPatient = {
    resourceType: "Patient",
    id: patient.id,
    identifier: [{ system: "https://radpilot.example/mrn", value: patient.mrn }],
    name: [{ text: patient.fullName }],
    gender: SEX_MAP[patient.sex],
    birthDate: patient.birthDate,
  };

  const observations: FhirObservation[] = observationItems.map((text, index) => ({
    resourceType: "Observation",
    id: `${report.id}-obs-${index + 1}`,
    status,
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/observation-category",
            code: "imaging",
            display: "Imaging",
          },
        ],
      },
    ],
    code: {
      coding: [{ system: "http://loinc.org", code: code.code, display: code.display }],
      text: "Finding",
    },
    subject: patientReference,
    valueString: text,
  }));

  const diagnosticReport: FhirDiagnosticReport = {
    resourceType: "DiagnosticReport",
    id: report.id,
    status,
    identifier: [{ system: "https://radpilot.example/accession", value: study.accession }],
    code: {
      coding: [{ system: "http://loinc.org", code: code.code, display: code.display }],
      text: study.description || code.display,
    },
    subject: patientReference,
    effectiveDateTime: study.studyDate,
    issued: report.signedAt ?? report.updatedAt,
    conclusion: impressionItems.join(" "),
    presentedForm: [
      {
        contentType: "text/plain",
        data: base64Encode(reportPlainText(report.content, template)),
        title: `${study.description || code.display} report`,
      },
    ],
    result: observations.map((obs) => ({ reference: `urn:uuid:${obs.id}` })),
  };

  const entry: FhirBundleEntry[] = [
    { fullUrl: reportFullUrl, resource: diagnosticReport },
    { fullUrl: patientFullUrl, resource: patientResource },
    ...observations.map((obs) => ({ fullUrl: `urn:uuid:${obs.id}`, resource: obs })),
  ];

  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: new Date().toISOString(),
    entry,
  };
}

// --- Minimal structural validator -------------------------------------------

export interface FhirValidationIssue {
  path: string;
  message: string;
}

export interface FhirValidationResult {
  valid: boolean;
  issues: FhirValidationIssue[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Minimal structural check of a FHIR Bundle produced by `toFhirBundle`:
 * required fields are present and resource references resolve within the
 * bundle. Not a full FHIR conformance validator.
 */
export function validateFhirBundle(bundle: FhirBundle): FhirValidationResult {
  const issues: FhirValidationIssue[] = [];

  if (bundle.resourceType !== "Bundle") {
    issues.push({ path: "resourceType", message: 'must be "Bundle"' });
  }
  if (bundle.type !== "collection") {
    issues.push({ path: "type", message: 'must be "collection"' });
  }
  if (!Array.isArray(bundle.entry) || bundle.entry.length === 0) {
    issues.push({ path: "entry", message: "must be a non-empty array" });
    return { valid: issues.length === 0, issues };
  }

  const knownFullUrls = new Set(bundle.entry.map((e) => e.fullUrl));
  const reports = bundle.entry.filter((e): e is FhirBundleEntry & { resource: FhirDiagnosticReport } =>
    e.resource.resourceType === "DiagnosticReport",
  );
  const observations = bundle.entry.filter((e): e is FhirBundleEntry & { resource: FhirObservation } =>
    e.resource.resourceType === "Observation",
  );
  const patients = bundle.entry.filter((e): e is FhirBundleEntry & { resource: FhirPatient } =>
    e.resource.resourceType === "Patient",
  );

  if (reports.length !== 1) {
    issues.push({ path: "entry", message: "bundle must contain exactly one DiagnosticReport" });
  }
  if (patients.length !== 1) {
    issues.push({ path: "entry", message: "bundle must contain exactly one Patient" });
  }

  function checkSubjectReference(path: string, subject: FhirReference | undefined) {
    if (!subject?.reference) {
      issues.push({ path, message: "subject.reference is required" });
    } else if (!knownFullUrls.has(subject.reference)) {
      issues.push({ path, message: `subject.reference ${subject.reference} does not resolve within the bundle` });
    }
  }

  for (const { resource, fullUrl } of reports) {
    const path = `DiagnosticReport(${fullUrl})`;
    if (!isNonEmptyString(resource.id)) issues.push({ path, message: "id is required" });
    if (resource.status !== "final" && resource.status !== "amended") {
      issues.push({ path, message: 'status must be "final" or "amended"' });
    }
    if (!resource.code?.coding?.length) issues.push({ path, message: "code.coding must be non-empty" });
    checkSubjectReference(path, resource.subject);
    if (!isNonEmptyString(resource.effectiveDateTime)) issues.push({ path, message: "effectiveDateTime is required" });
    if (typeof resource.conclusion !== "string") issues.push({ path, message: "conclusion is required (may be empty)" });
    for (const form of resource.presentedForm ?? []) {
      if (!isNonEmptyString(form.contentType)) issues.push({ path, message: "presentedForm.contentType is required" });
      if (!isNonEmptyString(form.data)) issues.push({ path, message: "presentedForm.data is required" });
    }
    for (const ref of resource.result ?? []) {
      if (ref.reference && !knownFullUrls.has(ref.reference)) {
        issues.push({ path, message: `result reference ${ref.reference} does not resolve within the bundle` });
      }
    }
  }

  for (const { resource, fullUrl } of observations) {
    const path = `Observation(${fullUrl})`;
    if (!isNonEmptyString(resource.id)) issues.push({ path, message: "id is required" });
    if (resource.status !== "final" && resource.status !== "amended") {
      issues.push({ path, message: 'status must be "final" or "amended"' });
    }
    if (!resource.code?.coding?.length) issues.push({ path, message: "code.coding must be non-empty" });
    checkSubjectReference(path, resource.subject);
    if (!isNonEmptyString(resource.valueString)) issues.push({ path, message: "valueString is required" });
  }

  for (const { resource, fullUrl } of patients) {
    const path = `Patient(${fullUrl})`;
    if (!isNonEmptyString(resource.id)) issues.push({ path, message: "id is required" });
    if (!resource.name?.length) issues.push({ path, message: "name must be non-empty" });
    if (!isNonEmptyString(resource.birthDate)) issues.push({ path, message: "birthDate is required" });
  }

  return { valid: issues.length === 0, issues };
}
