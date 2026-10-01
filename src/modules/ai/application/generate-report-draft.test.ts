import { describe, expect, it } from "vitest";
import { MockLLMProvider } from "../infrastructure/mock-provider";
import type { GenerationLogCompletion, GenerationLogEntry, GenerationLogRepository } from "./generation-log";
import { generateReportDraft } from "./generate-report-draft";

class InMemoryGenerationLog implements GenerationLogRepository {
  started: GenerationLogEntry[] = [];
  completions = new Map<string, GenerationLogCompletion>();
  outcomes = new Map<string, string>();

  async logStart(entry: GenerationLogEntry): Promise<void> {
    this.started.push(entry);
  }
  async complete(id: string, completion: GenerationLogCompletion): Promise<void> {
    this.completions.set(id, completion);
  }
  async updateOutcome(id: string, outcome: GenerationLogCompletion["outcome"]): Promise<void> {
    this.outcomes.set(id, outcome);
  }
}

const promptInput = {
  sections: [{ key: "findings" as const, label: "Findings", required: true }],
  exam: { modality: "CT" as const, bodyPart: "chest" as const, indication: "x", patientSex: "F" as const, patientAgeYears: 50 },
  shorthand: "no effusion",
};

describe("generateReportDraft", () => {
  it("logs a pending start, then completes with the final object and token usage", async () => {
    const provider = new MockLLMProvider();
    const log = new InMemoryGenerationLog();

    const result = generateReportDraft(provider, log, { reportId: "r1", createdBy: "u1", promptInput }, "gen-1");

    // Drain the stream before settling, like the route handler does.
    for await (const _part of result.partialObjectStream) {
      void _part;
    }
    await result.settle();

    expect(log.started).toHaveLength(1);
    expect(log.started[0]).toMatchObject({ id: "gen-1", reportId: "r1", provider: "mock", kind: "report_draft" });
    const completion = log.completions.get("gen-1");
    expect(completion?.outcome).toBe("pending");
    expect(completion?.error).toBeNull();
    expect(completion?.output).toMatchObject({ findings: expect.any(Array) });
  });

  it("logs an error outcome if the provider throws before settling", async () => {
    const throwingProvider = {
      name: "broken",
      model: "x",
      streamReport() {
        return {
          partialObjectStream: (async function* () {})(),
          textStream: (async function* () {})(),
          object: Promise.reject(new Error("boom")),
          usage: Promise.resolve({}),
        };
      },
      reviewReport: async () => ({ notes: "" }),
    };
    const log = new InMemoryGenerationLog();

    const result = generateReportDraft(throwingProvider, log, { reportId: null, createdBy: null, promptInput }, "gen-2");
    await result.settle();

    expect(log.completions.get("gen-2")?.outcome).toBe("error");
    expect(log.completions.get("gen-2")?.error).toMatch(/boom/);
  });
});
