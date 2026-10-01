// Server-only entry point: application use cases wired to infrastructure
// (Supabase repositories, LLM adapters). Import from Server Components,
// Server Functions and Route Handlers only.
export { recordAuditEvent, type AuditRecorder } from "./application/audit-recorder";
export { SupabaseAuditRecorder } from "./infrastructure/supabase-audit-recorder";
