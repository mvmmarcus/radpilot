// Server-only entry point: application use cases wired to infrastructure
// (Supabase repositories, LLM adapters). Import from Server Components,
// Server Functions and Route Handlers only.

// Row mappers (snake_case rows -> validated domain objects). Other modules use
// them through this entry point when they read this module's tables.
export {
  toContentJson,
  toReport,
  toReportVersion,
  type ReportRow,
  type ReportVersionRow,
} from "./infrastructure/mappers";

// Lifecycle use cases (markPreliminary, signReport, amendReport, version history)
// and the app-level sign gate that gives a friendly message before the DB
// trigger would reject an invalid sign.
export {
  amendReport,
  describeSignBlockReason,
  evaluateSignGate,
  getVersionHistory,
  InvalidTransitionError,
  markPreliminary,
  OptimisticConcurrencyError,
  signReport,
  SignBlockedError,
  type ReportLifecycleRepository,
  type SignBlockReason,
  type SignGateResult,
} from "./application/lifecycle";

export { SupabaseReportLifecycleRepository } from "./infrastructure/supabase-lifecycle-repository";
