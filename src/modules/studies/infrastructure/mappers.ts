import type { Tables } from "@/lib/supabase/database.types";
import { parseRow, toIsoDateTime } from "@/lib/supabase/mapping";
import {
  PatientSchema,
  StudySchema,
  WorklistItemSchema,
  type Patient,
  type Study,
  type WorklistItem,
} from "../domain/study";

export type PatientRow = Tables<"patients">;
export type StudyRow = Tables<"studies">;

/** Select string for worklist queries: the study with its patient embedded. */
export const WORKLIST_SELECT = "*, patient:patients(*)";

/** A `studies` row selected with WORKLIST_SELECT. */
export type WorklistRow = StudyRow & { patient: PatientRow | null };

export function toPatient(row: PatientRow): Patient {
  return parseRow(
    PatientSchema,
    { id: row.id, mrn: row.mrn, fullName: row.full_name, sex: row.sex, birthDate: row.birth_date },
    "patients",
    row.id,
  );
}

function studyFields(row: StudyRow) {
  return {
    id: row.id,
    accession: row.accession,
    patientId: row.patient_id,
    modality: row.modality,
    bodyPart: row.body_part,
    description: row.description,
    indication: row.indication,
    priority: row.priority,
    status: row.status,
    studyDate: toIsoDateTime(row.study_date),
    dicomPath: row.dicom_path,
    assignedTo: row.assigned_to,
  };
}

export function toStudy(row: StudyRow): Study {
  return parseRow(StudySchema, studyFields(row), "studies", row.id);
}

export function toWorklistItem(row: WorklistRow): WorklistItem {
  if (!row.patient) {
    throw new Error(`Study ${row.id} was selected without its patient. Use WORKLIST_SELECT.`);
  }
  return parseRow(
    WorklistItemSchema,
    { ...studyFields(row), patient: toPatient(row.patient) },
    "studies",
    row.id,
  );
}
