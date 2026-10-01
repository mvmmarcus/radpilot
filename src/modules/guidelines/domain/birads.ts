import { z } from "zod";

/**
 * ACR BI-RADS (Breast Imaging Reporting and Data System), 5th edition.
 * Source: American College of Radiology. ACR BI-RADS Atlas, 5th ed. 2013.
 * Category -> standard management text (simplified).
 */

export const BIRADS_CATEGORIES = [0, 1, 2, 3, 4, 5, 6] as const;
export const BiradsCategorySchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);
export type BiradsCategory = z.infer<typeof BiradsCategorySchema>;

export interface BiradsManagement {
  category: BiradsCategory;
  label: string;
  managementText: string;
}

const BIRADS_TABLE: Record<BiradsCategory, Omit<BiradsManagement, "category">> = {
  0: {
    label: "BI-RADS 0: Incomplete",
    managementText: "Additional imaging evaluation and/or comparison to prior studies is needed.",
  },
  1: {
    label: "BI-RADS 1: Negative",
    managementText: "Routine screening per age-appropriate guidelines.",
  },
  2: {
    label: "BI-RADS 2: Benign",
    managementText: "Routine screening per age-appropriate guidelines.",
  },
  3: {
    label: "BI-RADS 3: Probably benign",
    managementText: "Short-interval follow-up imaging at 6 months.",
  },
  4: {
    label: "BI-RADS 4: Suspicious abnormality",
    managementText: "Tissue diagnosis (biopsy) should be considered.",
  },
  5: {
    label: "BI-RADS 5: Highly suggestive of malignancy",
    managementText: "Biopsy and appropriate action should be taken.",
  },
  6: {
    label: "BI-RADS 6: Known biopsy-proven malignancy",
    managementText: "Appropriate oncologic management, as clinically indicated.",
  },
};

export function biradsManagement(category: BiradsCategory): BiradsManagement {
  return { category, ...BIRADS_TABLE[category] };
}
