import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseRow, RowMappingError, toIsoDateTime, toIsoDateTimeOrNull } from "./mapping";

describe("toIsoDateTime", () => {
  it("normalizes PostgREST timestamps to UTC ISO with milliseconds", () => {
    expect(toIsoDateTime("2026-10-01T12:34:56.123456+00:00")).toBe("2026-10-01T12:34:56.123Z");
    expect(toIsoDateTime("2026-10-01T09:34:56-03:00")).toBe("2026-10-01T12:34:56.000Z");
  });

  it("accepts the raw Postgres text format", () => {
    expect(toIsoDateTime("2026-10-01 12:34:56.5+00")).toBe("2026-10-01T12:34:56.500Z");
  });

  it("rejects garbage and passes null through", () => {
    expect(() => toIsoDateTime("yesterday")).toThrow(/Invalid timestamp/);
    expect(toIsoDateTimeOrNull(null)).toBeNull();
  });
});

describe("parseRow", () => {
  it("names the table and row when the schema rejects the value", () => {
    const schema = z.object({ id: z.uuid() });
    expect(() => parseRow(schema, { id: "nope" }, "studies", "nope")).toThrow(/studies\/nope/);
    try {
      parseRow(schema, { id: "nope" }, "studies", "nope");
    } catch (error) {
      expect(error).toBeInstanceOf(RowMappingError);
    }
  });
});
