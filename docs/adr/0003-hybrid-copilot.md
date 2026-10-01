# 0003: Hybrid copilot (rules + LLM + guidelines)

## Context

A radiology report has to be both coherent prose and a safety-critical structured
document. Known, well-documented, recurring error classes exist (laterality conflicts
between indication/findings/impression, sex-anatomy mismatches, findings dropped from
the impression, missing units on measurements, missed critical-finding language, missed
guideline-driven follow-up for incidental findings). An LLM-only review pass is
appealing — one prompt, one call — but is a poor fit for exactly these cases:

- LLM judgment on a fixed, enumerable rule (e.g. "does 'left' appear in indication but
  'right' in findings for the same organ?") is slower, costs tokens, and is
  non-deterministic where a deterministic answer exists and is testable.
- Missing a blocking safety check (e.g. failing to flag a pneumothorax) because the LLM
  review happened to omit it on one call is an unacceptable failure mode for something
  that can be a simple, always-correct string/structure check.
- Conversely, some issues genuinely need judgment an enumerable rule can't express well
  (e.g. "this sentence is ambiguous," subtler clinical inconsistencies) — a pure rules
  engine would miss these entirely.

## Decision

Run **three independent sources** over the same `ReportContent`, and merge their output
into one `copilot_issues` list, rather than choosing one mechanism:

1. **Deterministic rules** (`CopilotRule`, `src/modules/copilot/domain/issue.ts:79`):
   pure functions of `RuleContext` (content + study + patient, no I/O), each with its
   own unit tests — `laterality-conflict`, `sex-mismatch`,
   `finding-missing-from-impression`, `critical-finding`, `measurement-units`. These are
   exhaustively testable and have zero false-negative tolerance for the cases they
   cover.
2. **Guideline calculators** (`guidelines` module): Fleischner, BI-RADS, TI-RADS,
   LI-RADS, each a pure function with a cited source, feeding a "guideline suggestion"
   rule that proposes a recommendation as a one-click `SuggestedFix` (`kind: "append"`,
   `src/modules/copilot/domain/issue.ts:40`) rather than silently inserting text.
3. **LLM review** (`CopilotReviewer` port, reusing or mirroring Track B's `LLMProvider`):
   a non-deterministic pass for issues that don't reduce to an enumerable rule. The Mock
   implementation returns no issues, so tests, evals and the offline demo exercise only
   the deterministic layer deterministically.

All three produce the same shape, `CopilotIssueDraft[]` — `source: "rule" | "llm" |
"guideline"`, `severity: "blocking" | "warning" | "info"`, an optional `TextSpan` and an
optional `SuggestedFix`. `CopilotService.run` merges them, **replaces open issues**
(resolved ones are kept as history — enforced by the RLS policy that only allows
deleting unresolved `copilot_issues` rows), and the UI groups the result by severity
with one-click fix (`applyFix`, pure) and dismiss for non-blocking issues.

Only `severity: "blocking"` and unresolved matters for the signing gate
(`isBlockingOpen`, `src/modules/copilot/domain/issue.ts:85`) — and that gate is
re-enforced in the database (`reports_before_update`,
`supabase/migrations/20261001000000_init_schema.sql:294`), independent of which source
produced the blocking issue.

## Consequences

- Safety-critical checks (critical-finding keywords, laterality, sex-mismatch) have
  deterministic, unit-tested coverage that does not depend on model behavior staying
  stable across LLM provider upgrades.
- The LLM review layer can be entirely absent (Mock) without regressing the blocking
  checks that matter most, which keeps the signing gate's behavior reproducible in CI
  and demos.
- Guideline recommendations are explicit, cited, and opt-in (`SuggestedFix`, clicked by
  the radiologist), not silently injected text — preserving radiologist authorship of
  the final report.
- Cost: three code paths to maintain instead of one, and a merge step
  (`CopilotService.run`) that has to reconcile three sources' output into one list
  without duplicate or conflicting issues on the same text span.
- Extending coverage (a new rule, a new guideline) is additive and isolated — a new
  `CopilotRule` implementation with its own test, no change to the merge logic, the UI,
  or the DB schema (rules are app-layer, not persisted as code).

## Alternatives considered

- **LLM-only review.** Simplest single mechanism, but non-deterministic coverage of
  safety-critical, enumerable checks is not acceptable for things like critical-finding
  detection — a single bad sample should not be able to silently skip a flag that a
  three-line string check would catch reliably. Rejected as the sole mechanism (still
  used as a complementary layer).
- **Rules-only (no LLM review).** Fully deterministic and testable, but rules are
  necessarily finite and pre-enumerated; this would catch nothing outside the rules the
  team thought to write, with no path to catching subtler issues. Rejected as
  insufficient on its own, though it is the mechanism for everything safety-critical.
- **One combined LLM prompt that both drafts the report and reviews it.** Conflates two
  different jobs (generation and critique) in one call, loses the ability to swap/mock
  each independently, and makes the review step inherit any drafting-step blind spot
  (the same model is unlikely to catch its own omission in the same pass). Rejected in
  favor of a separate reviewer port.
