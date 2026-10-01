import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type {
  GenerationLogCompletion,
  GenerationLogEntry,
  GenerationLogRepository,
} from "../application/generation-log";
import type { GenerationCounter } from "../application/quota";

export class SupabaseGenerationLogRepository implements GenerationLogRepository, GenerationCounter {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async countSince(since: Date, createdBy?: string): Promise<number> {
    let query = this.client
      .from("ai_generations")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since.toISOString());
    if (createdBy) query = query.eq("created_by", createdBy);
    const { count, error } = await query;
    if (error) throw new Error(`Failed to count ai_generations: ${error.message}`);
    return count ?? 0;
  }

  async logStart(entry: GenerationLogEntry): Promise<void> {
    const { error } = await this.client.from("ai_generations").insert({
      id: entry.id,
      report_id: entry.reportId,
      kind: entry.kind,
      prompt_version: entry.promptVersion,
      provider: entry.provider,
      model: entry.model,
      input: entry.input as Json,
      outcome: "pending",
      created_by: entry.createdBy,
    });
    if (error) throw new Error(`Failed to log ai_generations start: ${error.message}`);
  }

  async complete(id: string, completion: GenerationLogCompletion): Promise<void> {
    const { error } = await this.client
      .from("ai_generations")
      .update({
        output: completion.output as Json,
        latency_ms: completion.latencyMs,
        input_tokens: completion.inputTokens,
        output_tokens: completion.outputTokens,
        outcome: completion.outcome,
        error: completion.error,
      })
      .eq("id", id);
    if (error) throw new Error(`Failed to complete ai_generations ${id}: ${error.message}`);
  }

  async updateOutcome(id: string, outcome: GenerationLogCompletion["outcome"]): Promise<void> {
    const { error } = await this.client.from("ai_generations").update({ outcome }).eq("id", id);
    if (error) throw new Error(`Failed to update ai_generations ${id} outcome: ${error.message}`);
  }
}
