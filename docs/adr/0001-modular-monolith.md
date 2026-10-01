# 0001: Modular monolith

## Context

RadPilot is built by one team shipping one deployable product (a Next.js app on
Vercel, one Supabase project) across several roughly-parallel workstreams: worklist,
editor/AI generation, copilot/lifecycle, viewer/interop. The domains involved —
worklist triage, structured reporting, AI generation, safety-rule review, DICOM
viewing, FHIR/PDF export — are distinct enough to want clear seams, but the project is
too small, too early, and too single-team for the operational cost of real service
boundaries (separate deploys, network calls, independent scaling, service discovery,
distributed tracing, data consistency across services).

## Decision

Build one Next.js app and one Postgres database, organized as a **modular monolith**:
`src/modules/<name>/{domain,application,infrastructure,ui}`, with module boundaries
enforced at the language/tooling level rather than at the network level.

- Each module exposes exactly three public entry points —
  `@/modules/<name>` (domain), `@/modules/<name>/server` (application, server-only),
  `@/modules/<name>/ui` (components) — documented and enforced by `no-restricted-imports`
  in `eslint.config.mjs`. Reaching into another module's `domain/application/
  infrastructure/ui` internals directly is a lint error, not just a convention.
- `domain/` is additionally forbidden from importing React, Next, Supabase, the AI SDK,
  Tiptap, Cornerstone, `@react-pdf/renderer`, or `@/lib/*` — enforced by a second,
  stricter ESLint pattern scoped to `src/modules/*/domain/**`. This keeps business logic
  (report lifecycle, copilot rules, guideline math) pure, synchronous, and testable with
  zero mocking.
- The database itself enforces cross-cutting invariants (status transitions, signing
  gates, append-only audit) via triggers and RLS — see
  `docs/adr/0006-db-enforced-invariants.md` — so the "modular" boundary is about code
  organization and ownership, not about who is allowed to bypass a safety rule.

## Consequences

- Parallel tracks (A worklist, B editor/AI, C copilot/lifecycle, D viewer/interop) can
  work in separate git worktrees with low merge conflict risk, because each owns a
  distinct `src/modules/*` subtree and the shared contract is the small set of domain
  types listed in `docs/sessions.md`.
- Refactoring the module boundary (e.g. extracting `copilot` into its own service later)
  is lower-risk than in an unstructured monolith, because the dependency direction is
  already explicit and one-way (ESLint would catch new violations immediately if the
  rule set were kept after a hypothetical extraction).
- `domain/` test suites run with Vitest and no test doubles for I/O at all, which keeps
  the fastest, most valuable tests (report lifecycle, copilot rules, guideline
  thresholds) cheap to write and fast to run.
- The cost is discipline overhead: every new cross-module dependency has to go through a
  barrel file, and a genuinely cross-cutting change (e.g. adding a field to
  `ReportContent`) still has to touch every consumer, same as in any monolith — the
  module split does not eliminate coupling, only make the allowed coupling visible and
  linted.
- If the team or deployment model changes (e.g. the `viewer` module needs independent
  scaling because Cornerstone/DICOM processing is CPU-heavy), the module boundaries
  already drawn make a future service extraction a matter of moving a `src/modules/x`
  folder behind an HTTP/RPC port implementation, rather than a from-scratch redesign.

## Alternatives considered

- **Unstructured monolith (no module boundaries).** Fastest to start, but with four
  parallel tracks editing the same codebase, there's no record of what each track is
  "allowed" to touch — the kind of ambiguity that produces the worst kind of merge
  conflict (semantic, not textual). Rejected for a multi-track build.
- **Microservices per module (worklist service, reporting service, copilot service,
  viewer service).** Would add real deployment, versioning and distributed-transaction
  costs (e.g. "sign report" touching reports, copilot_issues and audit_events would need
  a saga or a shared database anyway) for a single-team, single-deployable product with
  no current scaling requirement that a monolith can't meet. Rejected as premature.
- **Feature-folder monolith with no enforced boundary (just a naming convention).**
  Convention without enforcement erodes under deadline pressure — someone reaches into
  `reports/infrastructure` from the `copilot` module once, and the boundary stops
  meaning anything. Rejected in favor of lint-enforced entry points, which cost one
  ESLint config and pay for themselves on every PR.
