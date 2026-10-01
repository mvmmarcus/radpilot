/**
 * Minimal fake of the subset of the Supabase client chain this module's
 * application functions use: `.from(table).select().eq(col, val).maybeSingle()`.
 * Not a general-purpose mock; just enough to unit-test exportFhir/renderPdf
 * without a live database (Supabase is not reachable in this environment).
 */
export interface FakeTable {
  [column: string]: unknown;
}

export function createFakeSupabase(tables: Record<string, FakeTable[]>) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      return {
        select() {
          let filtered = rows;
          const builder = {
            eq(column: string, value: unknown) {
              filtered = filtered.filter((row) => row[column] === value);
              return builder;
            },
            async maybeSingle() {
              return { data: filtered[0] ?? null, error: null };
            },
          };
          return builder;
        },
      };
    },
  };
}
