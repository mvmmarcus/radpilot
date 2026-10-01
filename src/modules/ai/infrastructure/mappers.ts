import type { Tables } from "@/lib/supabase/database.types";
import { parseRow, toIsoDateTime } from "@/lib/supabase/mapping";
import { AiGenerationSchema, type AiGeneration } from "../domain/generation";

export type AiGenerationRow = Tables<"ai_generations">;

export function toAiGeneration(row: AiGenerationRow): AiGeneration {
  return parseRow(
    AiGenerationSchema,
    {
      id: row.id,
      reportId: row.report_id,
      kind: row.kind,
      promptVersion: row.prompt_version,
      provider: row.provider,
      model: row.model,
      input: row.input,
      output: row.output,
      latencyMs: row.latency_ms,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      outcome: row.outcome,
      error: row.error,
      createdBy: row.created_by,
      createdAt: toIsoDateTime(row.created_at),
    },
    "ai_generations",
    row.id,
  );
}
