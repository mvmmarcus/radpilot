# 0005: Canonical ReportContent vs. Tiptap JSON

## Context

A radiology report is edited in a rich-text editor (Tiptap, chosen for its
section-as-node model and collaborative-editing potential) but is also read by several
non-editor consumers that have nothing to do with rich text: the copilot rules engine
(`RuleContext.content`), guideline calculators, the FHIR R4 mapper (one `Observation`
per finding/impression line), the PDF exporter, and the eval harness (scoring "every
impression item traces to a finding"). Tiptap's native document format is a recursive
ProseMirror JSON tree (nodes, marks, attrs) designed for rendering and editing, not for
querying "what does the Findings section say" or "is this AI text still pending
review."

Two more requirements push away from using Tiptap JSON as the system of record:

- **AI provenance must be queryable per section** — which section's text came from the
  model, and whether it's been reviewed — for the signing gate
  (`pendingAiSections`) and the editor's visual marking of pending text. This is a
  structured, per-section fact, awkward to express as marks/attrs on arbitrary
  ProseMirror nodes without the whole system (copilot, FHIR, PDF, evals) needing to
  understand ProseMirror's tree shape to read it.
- **The editor library is a UI decision that may change** (a different rich-text
  library, a future voice-dictation-first UI, a plain-textarea fallback) and none of
  copilot, FHIR export, PDF export or evals should need to change if it does.

## Decision

Define `ReportContent` (`src/modules/reports/domain/content.ts`) as the **canonical,
editor-independent** report representation, and make the Tiptap editor convert to and
from it rather than being the source of truth itself:

```ts
ReportContent = {
  schemaVersion: 1,
  sections: Partial<Record<SectionKey, {
    text: string;              // plain text; list sections use one item per line
    source: "human" | "template" | "ai";
    ai: { generationId: string | null; review: "pending" | "accepted" | "edited" } | null;
  }>>,
}
```

- `content` is what's persisted in `public.reports.content` (jsonb) and what every
  non-editor module reads: `RuleContext.content` for copilot rules, the FHIR/PDF
  mappers, the eval scorers, and the DB's own signing-gate trigger
  (`jsonb_path_exists(new.content, '$.sections.* ? (@.ai.review == "pending")')`,
  `supabase/migrations/20261001000000_init_schema.sql:290`) — the trigger itself only
  works because `content`'s shape is simple, stable JSON, not a ProseMirror tree.
- Plain text with line-based list semantics (`sectionItems` strips `"1."`, `"-"`, `"•"`
  markers and splits on newlines, `src/modules/reports/domain/content.ts:118`) is
  sufficient for radiology report sections, which are not richly formatted documents —
  this is a deliberate under-fit to Tiptap's full capability, trading rich formatting
  for a representation every consumer can parse trivially.
- The Tiptap editor's nodes are the template sections; editor code owns the
  bidirectional mapping (`ReportContent → Tiptap document` on load, `Tiptap document →
  ReportContent` on save/autosave) and nothing outside the editor module ever touches
  Tiptap's JSON.
- All of `ReportContent`'s mutations are pure functions over the type itself
  (`createReportContent`, `applyNormalReport`, `editSection`, `setAiSection`,
  `acceptAiSection`), which is what lets `copilot`'s `applyFix` and the eval harness
  construct and inspect content without an editor instance at all.
- `schemaVersion: 1` is a literal today, reserved for a future migration path if the
  shape needs to change after real content exists.

## Consequences

- Copilot, FHIR export, PDF export and evals depend only on `@/modules/reports` (the
  domain entry point) and never on Tiptap, satisfying the `domain/` ESLint rule that
  forbids `@tiptap/**` entirely (`eslint.config.mjs:35`).
- The signing gate and AI-provenance tracking are expressible as a single `jsonb_path_exists`
  check in Postgres, because the shape being queried is a plain object the database
  doesn't need ProseMirror-aware logic to inspect.
- Swapping the editor library is, in principle, a change contained to the editor's
  conversion functions — no other module's code or tests would need to change, because
  they were never written against Tiptap's shape.
- Cost: every editor keystroke that should be reflected in copilot/evals has to pass
  through the `ReportContent → Tiptap` /`Tiptap → ReportContent` conversion, which is
  extra code to write and keep round-trip-correct (tested directly, per Track B's test
  list: "ReportContent ↔ Tiptap round-trip").
- The plain-text-with-line-items model is intentionally not a rich document model — a
  future requirement for inline formatting (bold, tables) inside a section would need a
  deliberate extension of `ReportSection`, not something the current shape
  accommodates for free.

## Alternatives considered

- **Store Tiptap's ProseMirror JSON as the system of record; have copilot/FHIR/PDF/evals
  parse it directly.** Rejected: couples every non-editor consumer to ProseMirror's
  node/mark/attrs tree shape, makes the DB-level signing-gate check impractical
  (`jsonb_path_exists` against an arbitrary recursive tree is far less tractable than
  against a flat `sections` object), and ties the whole system's content shape to one
  UI library's internal format.
- **Store both a canonical model and the Tiptap JSON side by side, kept in sync.**
  Considered for preserving rich formatting, but introduces a synchronization problem
  (which one is authoritative if they disagree?) for no present requirement — radiology
  report sections in this project don't need rich formatting. Rejected as premature
  complexity; revisit if a requirement for rich section formatting appears.
- **Store report text as a single opaque blob per section (no `source`/`ai` metadata),
  tracking AI review state in a separate table.** Would normalize the data more
  traditionally, but splits a single section's "current state" across two reads/writes
  and two consistency boundaries (text in `reports.content`, review state elsewhere)
  for data that is always read and written together. Rejected in favor of keeping
  `source`/`ai` inline on each section.
