import { z } from "zod";

/**
 * Fleischner Society 2017 guideline for incidentally detected pulmonary
 * nodules in adults (excludes lung cancer screening, immunocompromise and
 * known primary cancer).
 *
 * Source: MacMahon H, Naidich DP, Goo JM, et al. "Guidelines for Management
 * of Incidental Pulmonary Nodules Detected on CT Images: From the Fleischner
 * Society 2017." Radiology. 2017;284(1):228-243.
 *
 * Simplified here to solid nodules only (no subsolid/ground-glass logic).
 */

export const FleischnerRiskSchema = z.enum(["low", "high"]);
export type FleischnerRisk = z.infer<typeof FleischnerRiskSchema>;

export const FleischnerNoduleInputSchema = z.object({
  /** Longest in-plane diameter, mm. */
  sizeMm: z.number().positive(),
  multiple: z.boolean(),
  risk: FleischnerRiskSchema,
});
export type FleischnerNoduleInput = z.infer<typeof FleischnerNoduleInputSchema>;

export interface FleischnerRecommendation {
  /** Guideline id, for citing in a copilot issue or recommendation. */
  guidelineId: "fleischner-2017";
  followUpText: string;
}

/**
 * Table 1 (single solid nodule) and Table 2 (multiple solid nodules) of the
 * 2017 guideline, simplified to the size breakpoints 6 mm and 8 mm.
 */
export function fleischnerRecommendation(input: FleischnerNoduleInput): FleischnerRecommendation {
  const { sizeMm, multiple, risk } = input;

  if (!multiple) {
    if (sizeMm < 6) {
      return {
        guidelineId: "fleischner-2017",
        followUpText:
          risk === "low"
            ? "No routine follow-up required."
            : "Optional CT at 12 months.",
      };
    }
    if (sizeMm <= 8) {
      return {
        guidelineId: "fleischner-2017",
        followUpText:
          risk === "low"
            ? "CT at 6-12 months, then consider CT at 18-24 months."
            : "CT at 6-12 months, then at 18-24 months.",
      };
    }
    return {
      guidelineId: "fleischner-2017",
      followUpText: "CT at 3 months, PET/CT, or tissue sampling.",
    };
  }

  // Multiple nodules: management follows the most suspicious (largest/dominant) nodule.
  if (sizeMm < 6) {
    return {
      guidelineId: "fleischner-2017",
      followUpText:
        risk === "low" ? "No routine follow-up required." : "CT at 12 months.",
    };
  }
  return {
    guidelineId: "fleischner-2017",
    followUpText: "CT at 3-6 months, then consider CT at 18-24 months depending on risk.",
  };
}
