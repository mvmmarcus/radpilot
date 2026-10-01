import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { AuditRecorder } from "../application/audit-recorder";
import type { NewAuditEvent } from "../domain/event";

/** Supabase-backed AuditRecorder. Insert-only, matching the `audit_events` RLS policy. */
export class SupabaseAuditRecorder implements AuditRecorder {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async record(event: NewAuditEvent): Promise<void> {
    const { error } = await this.client.from("audit_events").insert({
      actor_id: event.actorId,
      entity: event.entity,
      entity_id: event.entityId,
      action: event.action,
      payload: event.payload as never,
    });
    if (error) throw new Error(`Failed to record audit event: ${error.message}`);
  }
}
