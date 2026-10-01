import type { GeneratedReport, PartialGeneratedReport } from "../domain/generation";
import type {
  LLMProvider,
  ReviewReportResult,
  StreamReportResult,
} from "../application/provider";
import type { ReportDraftPromptInput } from "../application/prompts/report-draft.v1";

/**
 * Deterministic provider, no network. Turns radiologist shorthand (comma- or
 * period-separated clauses, e.g. "RLL 8mm solid nodule, no effusion") into a
 * plausible GeneratedReport. Same input always produces the same output, so
 * it is safe to unit test and to demo without API keys.
 */

const LATERALITY_WORDS: Record<string, string> = {
  rll: "right lower lobe",
  rul: "right upper lobe",
  rml: "right middle lobe",
  lll: "left lower lobe",
  lul: "left upper lobe",
  r: "right",
  l: "left",
  rt: "right",
  lt: "left",
  bilateral: "bilateral",
};

const NEGATION_PATTERNS: RegExp[] = [/^no\s+/i, /^without\s+/i];

function expandLaterality(clause: string): string {
  return clause.replace(/\b(rll|rul|rml|lll|lul|rt|lt|r|l|bilateral)\b/gi, (match) => {
    const expansion = LATERALITY_WORDS[match.toLowerCase()];
    return expansion ?? match;
  });
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

function splitClauses(shorthand: string): string[] {
  return shorthand
    .split(/[,.;]|\band\b/i)
    .map((c) => c.trim())
    .filter(Boolean);
}

/** True if the clause is a negative finding ("no effusion", "no PE"). */
function isNegative(clause: string): boolean {
  return NEGATION_PATTERNS.some((re) => re.test(clause));
}

/** True if the clause contains a measurement, which usually warrants a recommendation. */
function hasMeasurement(clause: string): boolean {
  return /\d+(\.\d+)?\s*(mm|cm)\b/i.test(clause);
}

/** Mentions a pulmonary nodule (singular or plural), which gets a Fleischner-style follow-up recommendation. */
function isNodule(clause: string): boolean {
  return /\bnodules?\b/i.test(clause);
}

function isPe(clause: string): boolean {
  return /\bpe\b|pulmonary embolism/i.test(clause);
}

function buildFindings(clauses: string[]): string[] {
  return clauses.map((clause) => `${capitalize(expandLaterality(clause))}.`);
}

function buildImpression(clauses: string[]): string[] {
  const positives = clauses.filter((c) => !isNegative(c));
  if (positives.length === 0) {
    return ["No acute abnormality identified."];
  }
  return positives.map((clause) => `${capitalize(expandLaterality(clause))}.`);
}

function buildRecommendations(clauses: string[]): string[] {
  const recs: string[] = [];
  for (const clause of clauses) {
    if (isNegative(clause)) continue;
    if (isNodule(clause) && hasMeasurement(clause)) {
      recs.push("Follow-up CT per Fleischner Society guidelines based on nodule size and patient risk factors.");
    } else if (isPe(clause)) {
      recs.push("Clinical correlation and consideration of anticoagulation per institutional protocol.");
    }
  }
  return recs;
}

/** Pure: shorthand -> GeneratedReport. Exported for unit tests. */
export function mockGenerateReport(input: ReportDraftPromptInput): GeneratedReport {
  const clauses = splitClauses(input.shorthand);
  const technique = `${input.exam.modality} ${input.exam.bodyPart.replace("_", " and ")} performed per protocol.`;
  if (clauses.length === 0) {
    return {
      technique,
      findings: ["No specific findings were provided."],
      impression: ["No acute abnormality identified."],
      recommendations: [],
    };
  }
  return {
    technique,
    findings: buildFindings(clauses),
    impression: buildImpression(clauses),
    recommendations: buildRecommendations(clauses),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Streams the object field by field so the UI can show section-by-section progress. */
async function* streamParts(report: GeneratedReport): AsyncGenerator<PartialGeneratedReport> {
  const partial: PartialGeneratedReport = {};
  partial.technique = report.technique;
  yield { ...partial };
  await sleep(10);

  partial.findings = [];
  for (const line of report.findings) {
    partial.findings = [...partial.findings, line];
    yield { ...partial, findings: [...partial.findings] };
    await sleep(10);
  }

  partial.impression = [];
  for (const line of report.impression) {
    partial.impression = [...partial.impression, line];
    yield { ...partial, impression: [...partial.impression] };
    await sleep(10);
  }

  partial.recommendations = [];
  for (const line of report.recommendations) {
    partial.recommendations = [...partial.recommendations, line];
    yield { ...partial, recommendations: [...partial.recommendations] };
    await sleep(10);
  }
}

/**
 * Text deltas that, concatenated, grow into the final object's JSON text --
 * the wire format @ai-sdk/react's useObject expects (it feeds the
 * accumulated text to a tolerant partial-JSON parser on every chunk). We
 * build the final text once and chunk it, rather than re-stringifying each
 * partial object, since re-serializing a growing object does not generally
 * produce a textually-growing string (closing brackets move).
 */
async function* streamFinalTextInChunks(report: GeneratedReport, chunkSize = 24): AsyncGenerator<string> {
  const full = JSON.stringify(report);
  for (let i = 0; i < full.length; i += chunkSize) {
    yield full.slice(i, i + chunkSize);
    await sleep(5);
  }
}

export class MockLLMProvider implements LLMProvider {
  readonly name = "mock";
  readonly model = "mock-deterministic-v1";

  streamReport(input: ReportDraftPromptInput): StreamReportResult {
    const report = mockGenerateReport(input);

    return {
      partialObjectStream: streamParts(report),
      textStream: streamFinalTextInChunks(report),
      object: Promise.resolve(report),
      usage: Promise.resolve({ inputTokens: input.shorthand.length, outputTokens: 0 }),
    };
  }

  /** The offline provider finds nothing, so tests and evals exercise only the deterministic rules. */
  async reviewReport(): Promise<ReviewReportResult> {
    return { findings: [], usage: {} };
  }
}
