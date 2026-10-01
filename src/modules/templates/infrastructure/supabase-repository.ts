import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { TemplateRepository } from "../application/repository";
import type { Template } from "../domain/template";
import { toTemplate } from "./mappers";

/** Supabase-backed TemplateRepository. `templates` is read-only from the app (see RLS). */
export class SupabaseTemplateRepository implements TemplateRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async listTemplates(): Promise<Template[]> {
    const { data, error } = await this.client.from("templates").select("*").order("name");
    if (error) throw new Error(`Failed to list templates: ${error.message}`);
    return (data ?? []).map(toTemplate);
  }

  async getTemplate(id: string): Promise<Template | null> {
    const { data, error } = await this.client.from("templates").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`Failed to load template ${id}: ${error.message}`);
    return data ? toTemplate(data) : null;
  }
}
