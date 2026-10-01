import { z } from "zod";

/**
 * LI-RADS (Liver Imaging Reporting and Data System) v2018 CT/MRI diagnostic
 * algorithm for observations in patients at high risk for hepatocellular
 * carcinoma (HCC), simplified to the major features.
 *
 * Source: American College of Radiology. CT/MRI LI-RADS v2018.
 */

export const LIRADS_CATEGORIES = ["LR-1", "LR-2", "LR-3", "LR-4", "LR-5", "LR-M", "LR-TIV"] as const;
export type LiradsCategory = (typeof LIRADS_CATEGORIES)[number];

export const LiradsObservationSchema = z.object({
  /** Longest diameter, mm. */
  sizeMm: z.number().positive(),
  /** Nonrim arterial phase hyperenhancement. */
  aphe: z.boolean(),
  /** Nonperipheral "washout" in portal venous or delayed phase. */
  washout: z.boolean(),
  /** Enhancing "capsule". */
  capsule: z.boolean(),
  /** Threshold growth (>=50% in <=6 months), when known. */
  thresholdGrowth: z.boolean(),
  /** Tumor in vein (malignant portal/hepatic venous invasion). */
  tumorInVein: z.boolean(),
  /** Imaging features atypical for HCC, more typical of another malignancy (LR-M rim APHE, infiltrative, etc). */
  malignantNotHccFeatures: z.boolean(),
});
export type LiradsObservation = z.infer<typeof LiradsObservationSchema>;

export interface LiradsResult {
  category: LiradsCategory;
  rationale: string;
}

/**
 * Simplified major-feature algorithm. Checks the definite categories first
 * (LR-TIV, LR-M), then applies the CT/MRI Diagnostic Table size/feature
 * thresholds for LR-5 (definite HCC), falling back to LR-4 (probably HCC)
 * when APHE or a major feature is present but the LR-5 threshold is not met,
 * and LR-3 (intermediate) when none are present.
 *
 * LR-5 thresholds (Table, simplified):
 *   >=20mm: APHE + >=1 additional major feature (washout, capsule, growth)
 *   10-19mm: APHE + >=2 additional major features
 *   <10mm: not achievable (falls through to LR-4/LR-3)
 */
export function liradsCategory(obs: LiradsObservation): LiradsResult {
  if (obs.tumorInVein) {
    return { category: "LR-TIV", rationale: "Definite tumor in vein." };
  }
  if (obs.malignantNotHccFeatures) {
    return { category: "LR-M", rationale: "Imaging features atypical for HCC, probably malignant." };
  }

  const additionalMajorFeatures = [obs.washout, obs.capsule, obs.thresholdGrowth].filter(Boolean).length;

  const meetsLr5 =
    obs.aphe &&
    ((obs.sizeMm >= 20 && additionalMajorFeatures >= 1) || (obs.sizeMm >= 10 && additionalMajorFeatures >= 2));
  if (meetsLr5) {
    return { category: "LR-5", rationale: "APHE with enough additional major features for its size: definite HCC." };
  }

  if (obs.aphe || additionalMajorFeatures >= 1) {
    return { category: "LR-4", rationale: "APHE and/or a major feature present, but below the LR-5 threshold: probably HCC." };
  }

  return { category: "LR-3", rationale: "No APHE or major features: intermediate probability of HCC." };
}
