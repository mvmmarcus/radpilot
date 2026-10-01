import { describe, expect, it } from "vitest";
import type { ReportDraftPromptInput } from "../application/prompts/report-draft.v1";
import { mockGenerateReport, MockLLMProvider } from "./mock-provider";

const baseExam: ReportDraftPromptInput["exam"] = {
  modality: "CT",
  bodyPart: "chest",
  indication: "Suspected PE",
  patientSex: "F",
  patientAgeYears: 58,
};

describe("mockGenerateReport", () => {
  it("is deterministic for the same input", () => {
    const input: ReportDraftPromptInput = {
      sections: [],
      exam: baseExam,
      shorthand: "RLL 8mm solid nodule, no effusion",
    };
    expect(mockGenerateReport(input)).toEqual(mockGenerateReport(input));
  });

  it("turns shorthand into findings, expanding laterality abbreviations", () => {
    const report = mockGenerateReport({
      sections: [],
      exam: baseExam,
      shorthand: "RLL 8mm solid nodule, no effusion",
    });
    expect(report.findings).toEqual(["Right lower lobe 8mm solid nodule.", "No effusion."]);
  });

  it("excludes negative findings from the impression and keeps positives", () => {
    const report = mockGenerateReport({
      sections: [],
      exam: baseExam,
      shorthand: "RLL 8mm solid nodule, no effusion",
    });
    expect(report.impression).toEqual(["Right lower lobe 8mm solid nodule."]);
  });

  it("falls back to a normal impression when every clause is negative", () => {
    const report = mockGenerateReport({ sections: [], exam: baseExam, shorthand: "no effusion, no nodule" });
    expect(report.impression).toEqual(["No acute abnormality identified."]);
  });

  it("recommends Fleischner follow-up for a measured nodule", () => {
    const report = mockGenerateReport({
      sections: [],
      exam: baseExam,
      shorthand: "RLL 8mm solid nodule",
    });
    expect(report.recommendations[0]).toMatch(/Fleischner/);
  });

  it("recommends anticoagulation workup for PE", () => {
    const report = mockGenerateReport({ sections: [], exam: baseExam, shorthand: "acute PE in RLL artery" });
    expect(report.recommendations[0]).toMatch(/anticoagulation/);
  });

  it("handles empty shorthand gracefully", () => {
    const report = mockGenerateReport({ sections: [], exam: baseExam, shorthand: "" });
    expect(report.findings).toEqual(["No specific findings were provided."]);
    expect(report.impression).toEqual(["No acute abnormality identified."]);
    expect(report.recommendations).toEqual([]);
  });
});

describe("MockLLMProvider", () => {
  it("streams partial objects that build up to the final object", async () => {
    const provider = new MockLLMProvider();
    const input: ReportDraftPromptInput = { sections: [], exam: baseExam, shorthand: "RLL 8mm nodule, no effusion" };
    const { partialObjectStream, object } = provider.streamReport(input);

    const seen: unknown[] = [];
    for await (const partial of partialObjectStream) {
      seen.push(partial);
    }
    expect(seen.length).toBeGreaterThan(1);
    const last = seen[seen.length - 1] as Record<string, unknown>;
    const final = await object;
    expect(last.findings).toEqual(final.findings);
    expect(last.impression).toEqual(final.impression);
  });

  it("reports usage and a stable model/provider name", async () => {
    const provider = new MockLLMProvider();
    const { usage } = provider.streamReport({ sections: [], exam: baseExam, shorthand: "no effusion" });
    expect(provider.name).toBe("mock");
    expect(await usage).toMatchObject({ outputTokens: 0 });
  });

  it("concatenates textStream deltas into valid JSON matching the final object", async () => {
    const provider = new MockLLMProvider();
    const input: ReportDraftPromptInput = { sections: [], exam: baseExam, shorthand: "RLL 8mm nodule, no effusion" };
    const { textStream, object } = provider.streamReport(input);

    let accumulated = "";
    for await (const delta of textStream) {
      accumulated += delta;
    }
    expect(JSON.parse(accumulated)).toEqual(await object);
  });
});
