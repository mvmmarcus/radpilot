import type { AuditAction, AuditEntity, NewAuditEvent } from "../domain/event";

/**
 * Port other modules depend on to record audit events, without importing
 * Supabase directly (domain/ and application/ stay I/O-free and testable).
 * The append-only guarantee is enforced by the database trigger
 * `audit_events_no_update_delete` (see supabase/migrations), not by this
 * interface; this is just the write path.
 */
export interface AuditRecorder {
  record(event: NewAuditEvent): Promise<void>;
}

/** Narrows `record` to a single action, so callers can't typo the entity/action pairing. */
export function recordAuditEvent(
  recorder: AuditRecorder,
  params: { actorId: string | null; entity: AuditEntity; entityId: string; action: AuditAction; payload?: Record<string, unknown> },
): Promise<void> {
  return recorder.record({
    actorId: params.actorId,
    entity: params.entity,
    entityId: params.entityId,
    action: params.action,
    payload: params.payload ?? {},
  });
}
