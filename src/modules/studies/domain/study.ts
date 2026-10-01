import { z } from "zod";

// --- Patient ---------------------------------------------------------------

/** DICOM (0010,0040) Patient's Sex: F, M, O (other). U = unknown. */
export const PATIENT_SEXES = ["F", "M", "O", "U"] as const;
export const PatientSexSchema = z.enum(PATIENT_SEXES);
export type PatientSex = z.infer<typeof PatientSexSchema>;

export const PatientSchema = z.object({
  id: z.uuid(),
  /** Medical record number. Synthetic only in this project. */
  mrn: z.string().min(1),
  fullName: z.string().min(1),
  sex: PatientSexSchema,
  birthDate: z.iso.date(),
});
export type Patient = z.infer<typeof PatientSchema>;

// --- Study -----------------------------------------------------------------

export const MODALITIES = ["CT", "MR", "CR", "US", "MG"] as const;
export const ModalitySchema = z.enum(MODALITIES);
export type Modality = z.infer<typeof ModalitySchema>;

export const MODALITY_LABELS: Record<Modality, string> = {
  CT: "Computed tomography",
  MR: "Magnetic resonance",
  CR: "Radiograph",
  US: "Ultrasound",
  MG: "Mammography",
};

export const BODY_PARTS = ["head", "chest", "abdomen_pelvis", "thyroid", "breast"] as const;
export const BodyPartSchema = z.enum(BODY_PARTS);
export type BodyPart = z.infer<typeof BodyPartSchema>;

export const STUDY_PRIORITIES = ["stat", "urgent", "routine"] as const;
export const StudyPrioritySchema = z.enum(STUDY_PRIORITIES);
export type StudyPriority = z.infer<typeof StudyPrioritySchema>;

/** Lower rank is read first. */
export const PRIORITY_RANK: Record<StudyPriority, number> = { stat: 0, urgent: 1, routine: 2 };

/**
 * Worklist status of a study. It mirrors the report lifecycle:
 * unread (no report) -> in_progress (draft) -> preliminary -> final.
 * While an amendment is open (report status `amended`) the study goes back to
 * `in_progress`. The database keeps this in sync (trigger on reports).
 */
export const STUDY_STATUSES = ["unread", "in_progress", "preliminary", "final"] as const;
export const StudyStatusSchema = z.enum(STUDY_STATUSES);
export type StudyStatus = z.infer<typeof StudyStatusSchema>;

export const StudySchema = z.object({
  id: z.uuid(),
  accession: z.string().min(1),
  patientId: z.uuid(),
  modality: ModalitySchema,
  bodyPart: BodyPartSchema,
  description: z.string(),
  /** Free-text reason for the exam from the order, e.g. "Suspected PE". */
  indication: z.string(),
  priority: StudyPrioritySchema,
  status: StudyStatusSchema,
  studyDate: z.iso.datetime({ offset: true }),
  /** Folder prefix in the `dicom` Storage bucket, e.g. "ct-chest-phantom". Null if no images. */
  dicomPath: z.string().min(1).nullable(),
  assignedTo: z.uuid().nullable(),
});
export type Study = z.infer<typeof StudySchema>;

/** A study joined with the patient fields the worklist needs. */
export const WorklistItemSchema = StudySchema.extend({
  patient: PatientSchema,
});
export type WorklistItem = z.infer<typeof WorklistItemSchema>;

// --- Pure helpers ------------------------------------------------------------

/** Worklist order: priority first (STAT on top), then oldest study first. */
export function compareWorklistOrder(
  a: Pick<Study, "priority" | "studyDate">,
  b: Pick<Study, "priority" | "studyDate">,
): number {
  const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (byPriority !== 0) return byPriority;
  return Date.parse(a.studyDate) - Date.parse(b.studyDate);
}

/** Age in whole years at a given date (defaults to now). */
export function ageInYears(birthDate: string, at: Date = new Date()): number {
  const [year, month, day] = birthDate.split("-").map(Number);
  let age = at.getUTCFullYear() - year;
  const beforeBirthday =
    at.getUTCMonth() + 1 < month || (at.getUTCMonth() + 1 === month && at.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

/** Compact label used in worklists and headers, e.g. "58F". */
export function ageSexLabel(patient: Pick<Patient, "birthDate" | "sex">, at?: Date): string {
  return `${ageInYears(patient.birthDate, at)}${patient.sex}`;
}
