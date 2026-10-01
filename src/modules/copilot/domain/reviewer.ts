import type { ReportContent } from "@/modules/reports";
import type { BodyPart, Modality, PatientSex } from "@/modules/studies";
import type { CopilotIssueDraft } from "./issue";

/**
 * Port for LLM-based report review, run alongside the deterministic rules
 * engine (see CopilotService). Track B's `LLMProvider.reviewReport` (once
 * merged into `@/modules/ai/server`) is expected to satisfy this same shape;
 * this interface is defined here as a stub so Track C is not blocked on
 * Track B landing first. If Track B's signature differs when it merges, only
 * the adapter construction needs to change -- CopilotService depends on this
 * interface, not on a concrete provider.
 */
export interface CopilotReviewInput {
  content: ReportContent;
  study: { modality: Modality; bodyPart: BodyPart; indication: string };
  patient: { sex: PatientSex; ageYears: number };
}

export interface CopilotReviewer {
  /** Returns issue drafts (source "llm"). Never throws for a model/provider
   * error: on failure, the implementation should log and return []. */
  reviewReport(input: CopilotReviewInput): Promise<CopilotIssueDraft[]>;
}

/** Always returns no issues. Used when AI_PROVIDER=mock, and in tests. */
export const mockCopilotReviewer: CopilotReviewer = {
  async reviewReport() {
    return [];
  },
};
