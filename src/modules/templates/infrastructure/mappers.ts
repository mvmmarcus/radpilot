import type { Tables } from "@/lib/supabase/database.types";
import { parseRow } from "@/lib/supabase/mapping";
import { TemplateSchema, type Template } from "../domain/template";

export type TemplateRow = Tables<"templates">;

/**
 * `sections`, `macros` and `normal_text` are jsonb columns holding the domain
 * shapes as-is (camelCase inside the JSON), so they are validated, not renamed.
 */
export function toTemplate(row: TemplateRow): Template {
  return parseRow(
    TemplateSchema,
    {
      id: row.id,
      slug: row.slug,
      name: row.name,
      modality: row.modality,
      bodyPart: row.body_part,
      sections: row.sections,
      macros: row.macros,
      normalText: row.normal_text,
    },
    "templates",
    row.id,
  );
}
