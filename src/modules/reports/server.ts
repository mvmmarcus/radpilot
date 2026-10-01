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
