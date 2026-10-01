import type { GenerationKind, GenerationOutcome } from "../domain/generation";

/** Fields known before the call is made. PHI-bearing (shorthand, patient context): never log with `logger`. */
export interface GenerationLogEntry {
  id: string;
  reportId: string | null;
  kind: GenerationKind;
  promptVersion: string;
  provider: string;
  model: string;
  input: unknown;
  createdBy: string | null;
}

/** Fields known once the call finishes (success or failure). */
export interface GenerationLogCompletion {
  output: unknown | null;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  outcome: GenerationOutcome;
  error: string | null;
}

/**
 * Port for the ai_generations audit log. Every provider call is logged on
 * start (outcome "pending") and updated on completion, then again when a
 * section's AI text is accepted or edited (outcome tracks the acceptance-rate
 * metric: accepted / (accepted + edited + rejected)).
 */
export interface GenerationLogRepository {
  logStart(entry: GenerationLogEntry): Promise<void>;
  complete(id: string, completion: GenerationLogCompletion): Promise<void>;
  updateOutcome(id: string, outcome: GenerationOutcome): Promise<void>;
}
