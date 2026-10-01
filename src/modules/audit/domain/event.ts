import { z } from "zod";

export const AUDIT_ENTITIES = ["study", "report", "template", "ai_generation", "copilot_issue"] as const;
export const AuditEntitySchema = z.enum(AUDIT_ENTITIES);
export type AuditEntity = z.infer<typeof AuditEntitySchema>;

/** Known actions. Format is "<entity>.<verb>". */
export const AUDIT_ACTIONS = [
  "study.assigned",
  "report.created",
  "report.saved",
  "report.status_changed",
  "report.signed",
  "report.amended",
  "report.exported",
  "ai_generation.created",
  "ai_generation.reviewed",
  "copilot_issue.resolved",
] as const;
export const AuditActionSchema = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof AuditActionSchema>;

/** Append-only. The database rejects UPDATE and DELETE on audit_events. */
export const AuditEventSchema = z.object({
  id: z.number().int().positive(),
  actorId: z.uuid().nullable(),
  entity: AuditEntitySchema,
  entityId: z.uuid(),
  action: AuditActionSchema,
  /** Ids and status changes only. No report text or patient identifiers. */
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime({ offset: true }),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export type NewAuditEvent = Omit<AuditEvent, "id" | "createdAt">;
