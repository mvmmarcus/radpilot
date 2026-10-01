import type { Template } from "../domain/template";

/**
 * Port for reading templates. The Supabase implementation lives in
 * infrastructure/supabase-repository.ts; tests use an in-memory one.
 */
export interface TemplateRepository {
  listTemplates(): Promise<Template[]>;
  getTemplate(id: string): Promise<Template | null>;
}
