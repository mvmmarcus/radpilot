// Server-only entry point: application use cases wired to infrastructure
// (Supabase repositories, LLM adapters). Import from Server Components,
// Server Functions and Route Handlers only.

// Row mappers (snake_case rows -> validated domain objects). Other modules use
// them through this entry point when they read this module's tables.
export {
  toPatient,
  toStudy,
  toWorklistItem,
  WORKLIST_SELECT,
  type PatientRow,
  type StudyRow,
  type WorklistRow,
} from "./infrastructure/mappers";

// Application ports and use cases.
export type { StudyRepository, WorklistFilters } from "./application/study-repository";
export { listWorklist } from "./application/list-worklist";
export { claimStudy, type ClaimStudyResult } from "./application/claim-study";
export { releaseStudy, type ReleaseStudyResult } from "./application/release-study";
export { InMemoryStudyRepository } from "./application/in-memory-study-repository";

// Infrastructure.
export { SupabaseStudyRepository } from "./infrastructure/supabase-study-repository";
