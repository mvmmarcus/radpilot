import { z } from "zod";

/**
 * ACR TI-RADS (Thyroid Imaging Reporting and Data System).
 * Source: Tessler FN, Middleton WD, Grant EG, et al. "ACR Thyroid Imaging,
 * Reporting and Data System (TI-RADS): White Paper of the ACR TI-RADS
 * Committee." J Am Coll Radiol. 2017;14(5):587-595.
 *
 * Points are summed across 5 categories (composition, echogenicity, shape,
 * margin, echogenic foci) and converted to a TR level, which combined with
 * nodule size determines whether FNA or follow-up ultrasound is recommended.
 */

export const TiradsFeaturesSchema = z.object({
  /** Composition: cystic/spongiform 0, mixed 1, solid/almost entirely solid 2. */
  composition: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  /** Echogenicity: anechoic 0, hyper/isoechoic 1, hypoechoic 2, very hypoechoic 3. */
  echogenicity: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  /** Shape: wider-than-tall 0, taller-than-wide 3. */
  shape: z.union([z.literal(0), z.literal(3)]),
  /** Margin: smooth/ill-defined 0, lobulated/irregular 2, extra-thyroidal extension 3. */
  margin: z.union([z.literal(0), z.literal(2), z.literal(3)]),
  /** Echogenic foci: none/large comet-tail 0, macrocalcifications 1, peripheral 2, punctate 3. */
  echogenicFoci: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
});
export type TiradsFeatures = z.infer<typeof TiradsFeaturesSchema>;

export const TIRADS_LEVELS = ["TR1", "TR2", "TR3", "TR4", "TR5"] as const;
export type TiradsLevel = (typeof TIRADS_LEVELS)[number];

export interface TiradsResult {
  points: number;
  level: TiradsLevel;
  /** null = no FNA or follow-up recommended at this size. */
  fnaThresholdMm: number | null;
  followUpThresholdMm: number | null;
  recommendationText: string;
}

export function tiradsPoints(features: TiradsFeatures): number {
  return (
    features.composition + features.echogenicity + features.shape + features.margin + features.echogenicFoci
  );
}

export function tiradsLevel(points: number): TiradsLevel {
  if (points === 0) return "TR1";
  if (points === 1) return "TR2";
  if (points === 2) return "TR3";
  if (points <= 6) return "TR4";
  return "TR5";
}

/** FNA / follow-up thresholds by TR level (White Paper Table 4, simplified). */
const THRESHOLDS: Record<TiradsLevel, { fnaMm: number | null; followUpMm: number | null }> = {
  TR1: { fnaMm: null, followUpMm: null },
  TR2: { fnaMm: null, followUpMm: null },
  TR3: { fnaMm: 25, followUpMm: 15 },
  TR4: { fnaMm: 15, followUpMm: 10 },
  TR5: { fnaMm: 10, followUpMm: 5 },
};

/** Given TI-RADS features and the nodule's longest diameter, the full recommendation. */
export function tiradsRecommendation(features: TiradsFeatures, sizeMm: number): TiradsResult {
  const points = tiradsPoints(features);
  const level = tiradsLevel(points);
  const { fnaMm, followUpMm } = THRESHOLDS[level];

  let recommendationText: string;
  if (fnaMm !== null && sizeMm >= fnaMm) {
    recommendationText = `${level}: FNA recommended (nodule >= ${fnaMm} mm).`;
  } else if (followUpMm !== null && sizeMm >= followUpMm) {
    recommendationText = `${level}: Follow-up ultrasound recommended (nodule >= ${followUpMm} mm).`;
  } else if (level === "TR1" || level === "TR2") {
    recommendationText = `${level}: No FNA or follow-up required.`;
  } else {
    recommendationText = `${level}: No FNA or follow-up required at this size (< ${followUpMm} mm).`;
  }

  return { points, level, fnaThresholdMm: fnaMm, followUpThresholdMm: followUpMm, recommendationText };
}
