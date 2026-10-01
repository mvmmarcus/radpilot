import { z } from "zod";

/**
 * Helpers for the row mappers in src/modules/<m>/infrastructure/mappers.ts,
 * which turn snake_case database rows into domain objects validated by zod.
 */

/**
 * Postgres timestamptz as PostgREST returns it ("2026-10-01T12:00:00.123456+00:00",
 * or "2026-10-01 12:00:00.123456+00" from raw SQL) to ISO 8601 in UTC with
 * milliseconds ("2026-10-01T12:00:00.123Z"), the shape the domain schemas expect.
 */
export function toIsoDateTime(value: string): string {
  const normalized = value
    .trim()
    .replace(" ", "T")
    .replace(/(\.\d{3})\d+/, "$1") // keep milliseconds, drop micro/nanoseconds
    .replace(/([+-]\d{2})$/, "$1:00"); // "+00" -> "+00:00"
  const ms = Date.parse(normalized);
  if (Number.isNaN(ms)) throw new Error(`Invalid timestamp: ${value}`);
  return new Date(ms).toISOString();
}

export function toIsoDateTimeOrNull(value: string | null): string | null {
  return value === null ? null : toIsoDateTime(value);
}

/** Thrown when a database row does not match its domain schema. */
export class RowMappingError extends Error {
  readonly table: string;
  readonly rowId: string | number;
  readonly issues: z.ZodError;

  constructor(table: string, rowId: string | number, issues: z.ZodError) {
    super(`Row ${table}/${rowId} does not match the domain schema:\n${z.prettifyError(issues)}`);
    this.name = "RowMappingError";
    this.table = table;
    this.rowId = rowId;
    this.issues = issues;
  }
}

/** Parse a mapped row with its domain schema, naming the table and row on failure. */
export function parseRow<T extends z.ZodType>(
  schema: T,
  value: unknown,
  table: string,
  rowId: string | number,
): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new RowMappingError(table, rowId, result.error);
  return result.data;
}
