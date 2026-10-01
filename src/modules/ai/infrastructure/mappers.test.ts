import { describe, expect, it } from "vitest";
import { toAiGeneration, type AiGenerationRow } from "./mappers";

const row: AiGenerationRow = {
  id: "50000000-0000-4000-8000-000000000001",
  report_id: "40000000-0000-4000-8000-000000000001",
  kind: "report_draft",
  prompt_version: "report-draft@1",
  provider: "mock",
  model: "mock-deterministic-v1",
  input: { shorthand: "no effusion" },
  output: { findings: ["No effusion."] },
  latency_ms: 42,
  input_tokens: 10,
  output_tokens: 5,
  outcome: "pending",
  error: null,
  created_by: "a0000000-0000-4000-8000-000000000001",
  created_at: "2026-10-01T08:00:00+00:00",
};

describe("toAiGeneration", () => {
  it("maps an ai_generations row to a validated AiGeneration", () => {
    const generation = toAiGeneration(row);
    expect(generation).toMatchObject({
      id: row.id,
      reportId: row.report_id,
      kind: "report_draft",
      promptVersion: "report-draft@1",
      provider: "mock",
      latencyMs: 42,
      outcome: "pending",
      createdAt: "2026-10-01T08:00:00.000Z",
    });
  });

  it("allows null reportId, output and error", () => {
    const generation = toAiGeneration({ ...row, report_id: null, output: null, error: null });
    expect(generation.reportId).toBeNull();
    expect(generation.output).toBeNull();
  });

  it("rejects a row with an invalid outcome", () => {
    expect(() => toAiGeneration({ ...row, outcome: "not_a_real_outcome" as never })).toThrow(/ai_generations\/50000000/);
  });
});
