// Server-only entry point: application use cases wired to infrastructure
// (Supabase repositories, LLM adapters). Import from Server Components,
// Server Functions and Route Handlers only.

// Row mappers (snake_case rows -> validated domain objects). Other modules use
// them through this entry point when they read this module's tables.
export {
  toCopilotIssue,
  toCopilotIssueInsert,
  type CopilotIssueInsert,
  type CopilotIssueRow,
} from "./infrastructure/mappers";

// CopilotReviewer port (LLM review) and mock. See domain/reviewer.ts for the
// note on Track B's LLMProvider.reviewReport.
export {
  mockCopilotReviewer,
  type CopilotReviewer,
  type CopilotReviewInput,
} from "./domain/reviewer";

// Deterministic rules engine and pure applyFix.
export { ALL_RULES } from "./domain/rules";
export { applyFix } from "./domain/apply-fix";

// CopilotService: runs rules + LLM review, replaces open issues, resolves/dismisses with audit.
export {
  CopilotService,
  type AuditRecorder as CopilotAuditRecorder,
  type CopilotIssueRepository,
  type RunCopilotInput,
  type RunCopilotResult,
} from "./application/copilot-service";

export { SupabaseCopilotIssueRepository } from "./infrastructure/supabase-copilot-issue-repository";
