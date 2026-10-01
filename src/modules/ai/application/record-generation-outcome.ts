import type { GenerationOutcome } from "../domain/generation";
import type { GenerationLogRepository } from "./generation-log";

/** Called when a section's ai.review moves to "accepted" or "edited" (never "pending" again). */
export async function recordGenerationOutcome(
  log: GenerationLogRepository,
  generationId: string,
  review: Extract<GenerationOutcome, "accepted" | "edited" | "rejected">,
): Promise<void> {
  await log.updateOutcome(generationId, review);
}
