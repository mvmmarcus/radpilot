/**
 * Eval runner (Session 5). Golden cases (evals/cases.ts): shorthand + exam
 * context + expected properties. Scorers (evals/scorers.ts): required
 * sections present, laterality preserved, every impression item traces to a
 * finding, a recommendation present when a guideline applies, and a clearly
 * negative impression for fully negative shorthand.
 *
 * Runs against the configured LLMProvider directly (getLLMProvider(), driven
 * by AI_PROVIDER -- "mock" by default, no network or database needed), not
 * through the /api/generate route or ai_generations logging, so `npm run
 * eval` works offline in this sandbox and in CI.
 *
 * Usage: npm run eval                       (AI_PROVIDER=mock by default)
 *        AI_PROVIDER=openai npm run eval     (needs OPENAI_API_KEY)
 *        AI_PROVIDER=anthropic npm run eval  (needs ANTHROPIC_API_KEY)
 */
import { existsSync } from "node:fs";
import process from "node:process";
import type { GeneratedReport } from "@/modules/ai";
import { getLLMProvider } from "@/modules/ai/server";
import { GOLDEN_CASES, type GoldenCase } from "./cases";
import { scoreReport, type ScoreResult } from "./scorers";

// Only needed for AI_PROVIDER=openai|anthropic (the key lives there); the
// default "mock" provider needs no env at all, so a missing .env.local is not
// an error here.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

interface CaseOutcome {
  golden: GoldenCase;
  report: GeneratedReport | null;
  scores: ScoreResult[];
  error?: string;
}

async function runCase(golden: GoldenCase): Promise<CaseOutcome> {
  const provider = getLLMProvider();
  try {
    const stream = provider.streamReport({
      sections: golden.sections,
      exam: golden.exam,
      shorthand: golden.shorthand,
    });
    const report = await stream.object;
    return { golden, report, scores: scoreReport(report, golden) };
  } catch (error) {
    return {
      golden,
      report: null,
      scores: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function pad(s: string, width: number): string {
  return s.length >= width ? s.slice(0, width) : s + " ".repeat(width - s.length);
}

async function main() {
  const provider = getLLMProvider();
  console.log(`Running ${GOLDEN_CASES.length} golden case(s) against provider "${provider.name}" (${provider.model})\n`);

  const outcomes: CaseOutcome[] = [];
  for (const golden of GOLDEN_CASES) {
    outcomes.push(await runCase(golden));
  }

  const rows: string[] = [];
  rows.push(`${pad("Case", 32)} ${pad("Status", 8)} Failing scorers`);
  rows.push("-".repeat(90));

  let casesPassed = 0;
  let scorersTotal = 0;
  let scorersPassed = 0;

  for (const outcome of outcomes) {
    if (outcome.error) {
      rows.push(`${pad(outcome.golden.id, 32)} ${pad("ERROR", 8)} ${outcome.error}`);
      continue;
    }
    const failing = outcome.scores.filter((s) => !s.pass);
    scorersTotal += outcome.scores.length;
    scorersPassed += outcome.scores.length - failing.length;
    const casePass = failing.length === 0;
    if (casePass) casesPassed += 1;

    const failingDesc = failing.map((f) => `${f.scorer}${f.detail ? ` (${f.detail})` : ""}`).join("; ");
    rows.push(`${pad(outcome.golden.id, 32)} ${pad(casePass ? "PASS" : "FAIL", 8)} ${failingDesc}`);
  }

  console.log(rows.join("\n"));

  const casePassRate = (casesPassed / outcomes.length) * 100;
  const scorerPassRate = scorersTotal > 0 ? (scorersPassed / scorersTotal) * 100 : 0;

  console.log("\n" + "-".repeat(90));
  console.log(
    `Cases passed:   ${casesPassed}/${outcomes.length} (${casePassRate.toFixed(1)}%)\n` +
      `Scorers passed: ${scorersPassed}/${scorersTotal} (${scorerPassRate.toFixed(1)}%)`,
  );

  if (casesPassed < outcomes.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Eval run failed:", error);
  process.exitCode = 1;
});
