import { z } from "zod";

/**
 * Shape of supabase/dicom/<series>/manifest.json (written by
 * scripts/dicom/phantoms.ts, uploaded by npm run dicom:upload). Re-declared
 * here (rather than imported from scripts/) because domain/ may only depend
 * on zod and other modules' domain entry points.
 */
export const ManifestInstanceSchema = z.object({
  file: z.string().min(1),
  instanceNumber: z.number().int().positive(),
  sopInstanceUid: z.string().min(1),
  imagePositionPatient: z.tuple([z.number(), z.number(), z.number()]),
});
export type ManifestInstance = z.infer<typeof ManifestInstanceSchema>;

export const SeriesManifestSchema = z.object({
  series: z.string().min(1),
  synthetic: z.literal(true),
  modality: z.enum(["CT", "CR"]),
  description: z.string(),
  studyInstanceUid: z.string().min(1),
  seriesInstanceUid: z.string().min(1),
  frameOfReferenceUid: z.string().min(1),
  rows: z.number().int().positive(),
  columns: z.number().int().positive(),
  pixelSpacing: z.tuple([z.number(), z.number()]),
  sliceThickness: z.number().nullable(),
  window: z.object({ center: z.number(), width: z.number() }),
  instances: z.array(ManifestInstanceSchema).min(1),
});
export type SeriesManifest = z.infer<typeof SeriesManifestSchema>;

// --- Window/level presets ----------------------------------------------------

export const WINDOW_LEVEL_PRESETS = [
  { id: "lung", label: "Lung", windowCenter: -600, windowWidth: 1500 },
  { id: "mediastinum", label: "Mediastinum", windowCenter: 40, windowWidth: 400 },
  { id: "bone", label: "Bone", windowCenter: 400, windowWidth: 1800 },
  { id: "brain", label: "Brain", windowCenter: 40, windowWidth: 80 },
] as const;
export type WindowLevelPresetId = (typeof WINDOW_LEVEL_PRESETS)[number]["id"];
export interface WindowLevelPreset {
  id: WindowLevelPresetId;
  label: string;
  windowCenter: number;
  windowWidth: number;
}

export function findWindowLevelPreset(id: WindowLevelPresetId): WindowLevelPreset {
  const preset = WINDOW_LEVEL_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown window/level preset: ${id}`);
  return preset;
}

// --- Measurement event -------------------------------------------------------

/**
 * Emitted by the "Insert into Findings" button after a length measurement.
 * A later session wires this into the report editor (appends `text` to the
 * Findings section at the cursor, or as a new line).
 */
export const MeasurementEventSchema = z.object({
  text: z.string().min(1),
  tool: z.literal("length"),
  valueMm: z.number().nonnegative(),
  seriesDescription: z.string(),
  instanceNumber: z.number().int().positive(),
});
export type MeasurementEvent = z.infer<typeof MeasurementEventSchema>;

/**
 * Build the measurement event text, e.g. "8 mm, series 3 image 42".
 * `seriesNumber` is 1 unless the caller tracks multiple series for a study
 * (RadPilot's phantom studies are single-series, so this defaults to 1).
 */
export function formatMeasurementText(params: {
  lengthMm: number;
  instanceNumber: number;
  seriesNumber?: number;
}): string {
  const { lengthMm, instanceNumber, seriesNumber = 1 } = params;
  const rounded = Math.round(lengthMm);
  return `${rounded} mm, series ${seriesNumber} image ${instanceNumber}`;
}

export function toMeasurementEvent(params: {
  lengthMm: number;
  instanceNumber: number;
  seriesDescription: string;
  seriesNumber?: number;
}): MeasurementEvent {
  const { lengthMm, instanceNumber, seriesDescription, seriesNumber } = params;
  return {
    text: formatMeasurementText({ lengthMm, instanceNumber, seriesNumber }),
    tool: "length",
    valueMm: lengthMm,
    seriesDescription,
    instanceNumber,
  };
}
