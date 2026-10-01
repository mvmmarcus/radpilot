// Server-only entry point: application use cases wired to infrastructure
// (Supabase repositories, LLM adapters). Import from Server Components,
// Server Functions and Route Handlers only.

// Row mappers (snake_case rows -> validated domain objects). Other modules use
// them through this entry point when they read this module's tables.
export { toTemplate, type TemplateRow } from "./infrastructure/mappers";

// Repository port + Supabase implementation.
export type { TemplateRepository } from "./application/repository";
export { SupabaseTemplateRepository } from "./infrastructure/supabase-repository";

// Use cases.
export { getTemplateForStudy } from "./application/get-template-for-study";

// Macro expansion is pure and lives in the domain entry point (@/modules/templates),
// so client components (the Tiptap editor) can use it without a server import.
