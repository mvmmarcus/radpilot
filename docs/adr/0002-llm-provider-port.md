# 0002: LLM provider port

## Context

RadPilot generates report drafts (`report_draft`) and runs LLM-based safety review
(`copilot_review`) using a large language model. Three concerns push against hardcoding
a single vendor SDK call inline in the application:

1. **Determinism for tests, evals and offline demos.** CI, Vitest, the `npm run eval`
   harness and a laptop demo with no network or API key all need report generation to
   work without calling a real model.
2. **Vendor choice is a product decision, not an architectural one.** The team wants to
   compare OpenAI and Anthropic (cost, latency, quality on radiology shorthand) without
   rewriting call sites, and a future deployment may need to swap vendors for
   procurement, BAA/DPA, or regional-hosting reasons (see
   `docs/adr/0004-phi-policy.md`).
3. **Structured output is the contract, not prose.** Both the editor and the evals need
   a typed `{technique, findings[], impression[], recommendations[]}` object, not a
   chat completion string to be re-parsed downstream.

## Decision

Define an `LLMProvider` port (`src/modules/ai/application`) with two methods —
`streamReport()` and `reviewReport()` — and three adapters selected at runtime by
`getServerEnv().AI_PROVIDER` (`src/lib/env.ts`, `AI_PROVIDERS = ["mock", "openai",
"anthropic"]`):

- **OpenAI** and **Anthropic** adapters, both built on the Vercel AI SDK v6's
  `streamObject` against the same `GeneratedReportSchema`
  (`src/modules/ai/domain/generation.ts:19`) — the schema (with its zod `.describe()`
  annotations, which become the instructions sent to the model) is the single
  definition of "what a report draft looks like," shared across vendors.
- A **Mock** adapter: deterministic, dependency-free, turns shorthand like `"RLL 8mm
  solid nodule, no effusion"` into a plausible structured report with no network call.
  This is the default (`AI_PROVIDER` defaults to `"mock"`), so `npm run dev`, `npm run
  check`, Playwright and the public demo all work with zero secrets.
- Prompts are versioned in a registry
  (`src/modules/ai/application/prompts/report-draft.v1.ts`), taking template sections,
  exam context (modality, body part, indication, patient sex/age) and the shorthand as
  structured input — never raw chat history — so a prompt change is a new file
  (`report-draft.v2.ts`) rather than an in-place edit, and `ai_generations.prompt_version`
  (`"report-draft@3"` style, `src/modules/ai/domain/generation.ts:38`) records exactly
  which version produced a given output.
- Every call is logged to `ai_generations` (provider, model, prompt_version, latency,
  token counts, outcome) regardless of adapter, and the outcome is updated later when a
  radiologist accepts, edits, or implicitly rejects the generated section — this is
  adapter-agnostic because it operates on the logged row, not on vendor-specific
  response objects.

## Consequences

- Switching the active provider is a one-line env var change
  (`AI_PROVIDER=openai|anthropic|mock`); no call site changes.
- The acceptance-rate metric (`accepted / (accepted + edited + rejected)`, from
  `GenerationOutcome`) is comparable across providers because it's computed from the
  same logged schema regardless of which adapter produced the generation.
- Tests and evals run against the Mock adapter by default, which means they test
  RadPilot's prompt-construction and section-application logic, not the LLM's output
  quality — `npm run eval` is the layer that actually scores output quality against a
  real or mock provider, with its own golden cases.
- Cost: an adapter abstraction has to find the lowest common denominator across
  vendors' streaming APIs. The AI SDK v6's `streamObject` already does this well for
  structured output, which is why it was adopted instead of hand-rolling per-vendor
  parsing.
- A new vendor (e.g. a self-hosted open-weight model for on-prem/data-residency
  deployments) is a new adapter implementing the same port, not a refactor of
  `reports`/`copilot`/evals call sites.

## Alternatives considered

- **Call the OpenAI (or Anthropic) SDK directly from `reports/application`.** Simplest
  to write first, but couples the editor's use cases to one vendor's request/response
  shape, makes offline tests impossible without mocking the SDK itself, and makes a
  vendor switch a multi-file diff. Rejected.
- **LangChain or another agent framework as the abstraction layer.** Adds a large
  dependency and its own abstraction leakage for a need (structured-output generation
  from two vendors plus a mock) that the Vercel AI SDK already covers directly, with
  less surface area to learn and debug. Rejected as unnecessary weight.
- **Free-text generation, parsed with regex/string splitting into sections.** Would
  avoid structured-output constraints, but reintroduces exactly the fragile-parsing
  problem `streamObject` + zod solves, and provides a worse place to put per-section
  instructions (`.describe()` on each field). Rejected.
