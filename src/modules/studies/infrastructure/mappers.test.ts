import { describe, expect, it } from "vitest";
import { compareWorklistOrder } from "../domain/study";
import { toPatient, toStudy, toWorklistItem, type PatientRow, type StudyRow } from "./mappers";

const patientRow: PatientRow = {
  id: "10000000-0000-4000-8000-000000000001",
  mrn: "RP-100001",
  full_name: "Helen Carter",
  sex: "F",
  birth_date: "1968-05-30",
  created_at: "2026-10-01T00:00:00.000000+00:00",
};

const studyRow: StudyRow = {
  id: "20000000-0000-4000-8000-000000000001",
  accession: "RP26000001",
  patient_id: patientRow.id,
  modality: "CT",
  body_part: "chest",
  description: "CTA chest, pulmonary embolism protocol",
  indication: "Suspected pulmonary embolism.",
  priority: "stat",
  status: "unread",
  study_date: "2026-10-01T11:35:00.123456+00:00",
  dicom_path: "ct-chest-phantom",
  assigned_to: null,
  created_at: "2026-10-01T00:00:00+00:00",
  updated_at: "2026-10-01T00:00:00+00:00",
};

describe("studies mappers", () => {
  it("maps a patient row", () => {
    expect(toPatient(patientRow)).toEqual({
      id: patientRow.id,
      mrn: "RP-100001",
      fullName: "Helen Carter",
      sex: "F",
      birthDate: "1968-05-30",
    });
  });

  it("maps a study row and normalizes the timestamp", () => {
    const study = toStudy(studyRow);
    expect(study).toMatchObject({
      patientId: patientRow.id,
      bodyPart: "chest",
      dicomPath: "ct-chest-phantom",
      assignedTo: null,
      studyDate: "2026-10-01T11:35:00.123Z",
    });
    expect(study).not.toHaveProperty("body_part");
  });

  it("maps a worklist row with its embedded patient", () => {
    const item = toWorklistItem({ ...studyRow, patient: patientRow });
    expect(item.patient.fullName).toBe("Helen Carter");
    expect(item.accession).toBe("RP26000001");
    // The result plugs straight into the domain helpers.
    expect(compareWorklistOrder(item, { ...item, priority: "routine" })).toBeLessThan(0);
  });

  it("fails loudly when the patient was not selected", () => {
    expect(() => toWorklistItem({ ...studyRow, patient: null })).toThrow(/WORKLIST_SELECT/);
  });

  it("rejects a row that breaks the domain schema", () => {
    expect(() => toStudy({ ...studyRow, body_part: "knee" })).toThrow(/studies\/20000000/);
  });
});
