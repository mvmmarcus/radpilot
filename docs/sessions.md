# RadPilot: build sessions

How the remaining work is split across separate chats. Each session has a ready-to-paste
prompt. Run the sessions in this order:

```
Session 0b (data foundation) ──┐
                               ├──> Tracks A, B, C, D in parallel ──> Session 5 (glue)
Docs session (any time) ───────┘
```

## Status

| Session | Scope | Status |
|---|---|---|
| 0 | Scaffold, module skeleton, env, test configs, shared domain types, migrations + RLS | **done** |
| 0b | Seed data, phantom DICOM, generated DB types, row mappers | **done** |
| Docs | Domain primer, architecture, ADRs | can run any time, parallel |
| A | Auth, app shell, worklist | next |
| B | Templates, AI provider port, Tiptap editor + streaming generation | next |
| C | Copilot rules, guidelines, sign/amend lifecycle | next |
| D | DICOM viewer, FHIR R4 + PDF export | next |
| 5 | Reading room layout, evals, Playwright happy path, README, demo script | after A to D |

## What Session 0 left in place (the contracts)

- **Modules:** `src/modules/{studies,templates,reports,ai,copilot,guidelines,interop,audit}/`,
  each with `domain/ application/ infrastructure/ ui/`.
- **Public entry points** (enforced by ESLint `no-restricted-imports`):
  - `@/modules/<name>`: domain types, zod schemas and pure functions. Safe anywhere.
  - `@/modules/<name>/server`: application use cases wired to infrastructure. Server only.
  - `@/modules/<name>/ui`: React components.
  - Inside a module, use relative imports. `domain/` may not import React, Next, Supabase,
    the AI SDK, Tiptap, Cornerstone or `@/lib/*`.
- **Shared domain types (the contract between tracks):**
  - `studies`: `Patient`, `Study`, `WorklistItem`, `Modality`, `BodyPart`, `StudyPriority`,
    `StudyStatus`, `compareWorklistOrder`, `ageInYears`, `ageSexLabel`.
  - `templates`: `SectionKey` (+ order and labels), `TemplateSection`, `Macro`, `Template`,
    `selectTemplate`, `findMacro`.
  - `reports`: `ReportContent` (canonical, editor-independent), `ReportSection` with
    `source` and `ai.review`, `Report`, `ReportVersion`, the status machine
    (`REPORT_TRANSITIONS`, `nextStatus`, `isEditable`) and content helpers
    (`createReportContent`, `applyNormalReport`, `editSection`, `setAiSection`,
    `acceptAiSection`, `pendingAiSections`, `missingRequiredSections`, `sectionItems`).
  - `copilot`: `CopilotIssue`, `CopilotIssueDraft`, `TextSpan`, `SuggestedFix`
    (replace/append), `RuleContext`, `CopilotRule`, `isBlockingOpen`.
  - `ai`: `GeneratedReportSchema` (the `streamObject` schema), `AiGeneration`,
    `GenerationKind`, `GenerationOutcome`.
  - `audit`: `AuditEvent`, `AuditAction`, `AuditEntity`.
- **Database:** `supabase/migrations/` (schema, RLS, storage bucket). These invariants are
  enforced by the database itself, so app code can rely on them:
  - status transitions follow the lifecycle diagram
  - a final report's content is locked until it is amended
  - signing fails while AI text is pending review or a blocking copilot issue is open
  - signing works only in your own name (RLS)
  - `reports.version` is bumped on every update; use `... where id = $1 and version = $2`
    for optimistic concurrency
  - every report insert and status change writes `report_versions` and `audit_events`
    (by trigger; clients cannot write `report_versions`)
  - `studies.status` mirrors the report status (by trigger; clients may only change
    `assigned_to`)
  - `audit_events` is append-only
- **Lib:** `src/lib/env.ts` (zod-validated env, `AI_PROVIDER=mock` by default),
  `src/lib/supabase/{client,server,admin}.ts`, `src/lib/logger.ts` (no PHI in logs).
- **Tooling:** `npm run check` (typecheck, lint, unit tests), `npm run test:e2e`,
  `npm run eval` (placeholder), `db:*` and `dicom:*` scripts in `package.json`.

## What Session 0b added (the data)

- **Seed** (`supabase/seed.sql`, runs on `npm run db:reset`): demo users
  `radiologist@radpilot.test` and `admin@radpilot.test` (password `radpilot-demo`),
  6 templates, 10 synthetic patients/studies (one per demo feature, see the README
  table) and a signed final report for study 4. Fixed UUIDs:
  users `a0000000-0000-4000-8000-0000000000NN`, patients `10000000-…-0000000000NN`,
  studies `20000000-…-0000000000NN` (NN = study number 01-10), templates
  `30000000-…-00000000000N` (1 ct-chest, 2 ct-head, 3 ct-abdomen-pelvis, 4 cr-chest,
  5 us-thyroid, 6 mg-breast), report `40000000-0000-4000-8000-000000000004`.
  `src/lib/supabase/seed.test.ts` parses the seed JSON with the domain schemas.
- **Phantom DICOM:** `npm run dicom:generate` writes `supabase/dicom/<series>/0001.dcm…`
  plus `manifest.json` (instances in reading order, UIDs, geometry, default window);
  `npm run dicom:upload` puts them in the `dicom` bucket under `<series>/…`, which is
  what `studies.dicom_path` holds. Series: `ct-chest-phantom`, `ct-head-phantom`,
  `cr-chest-normal`, `cr-chest-pneumothorax`.
- **DB types:** `src/lib/supabase/database.types.ts` (regenerate with `npm run db:types`
  after a migration). Use `Tables<"studies">`, `TablesInsert<…>`, `Enums<…>`.
- **Row mappers** (snake_case rows → zod-validated domain objects), exported from each
  module's `server.ts`: studies `toPatient`, `toStudy`, `toWorklistItem` +
  `WORKLIST_SELECT`; templates `toTemplate`; reports `toReport`, `toReportVersion`,
  `toContentJson`; copilot `toCopilotIssue`, `toCopilotIssueInsert`. Timestamps are
  normalized to ISO UTC by `toIsoDateTime` (`src/lib/supabase/mapping.ts`); a row that
  breaks its schema throws `RowMappingError`.

## Rules for every session

1. **Run commands in your Mac terminal, not the chat sandbox.** `node_modules` holds macOS
   binaries, and the sandbox can't reach the npm registry. The sandbox can run `tsc` and
   ESLint, but not Vitest or `next build`. So before you commit, run `npm run check`
   (and `npm run build` for UI work) yourself.
2. **Use one git worktree per parallel track,** so four chats never edit the same folder:
   ```bash
   git worktree add ../radpilot-a -b track/a-worklist
   git worktree add ../radpilot-b -b track/b-editor-ai
   git worktree add ../radpilot-c -b track/c-copilot-lifecycle
   git worktree add ../radpilot-d -b track/d-viewer-interop
   # in each: cp ../radpilot/.env.local . && npm install
   ```
   Connect that worktree folder (not the main one) to the track's chat.
3. **Stay in your modules.** Shared domain files under `src/modules/*/domain` change only by
   adding to them. Never rename or remove an export another track uses. If a contract
   has to change, say so in the PR description.
4. **Migrations:** add a new timestamped file and never edit an existing one. Use
   your track's minute to avoid filename collisions: A `..._1000_`, B `..._2000_`,
   C `..._3000_`, D `..._4000_` (e.g. `20261002103000_copilot_index.sql`). After any
   migration, run `npm run db:reset && npm run db:types`.
5. **New npm packages:** install on your Mac and list them in the PR description, so
   merges don't fight over `package-lock.json`. Merge order A → B → C → D, and
   regenerate the lockfile on conflict (`npm install`).
6. **Tests:** each domain function needs a Vitest test next to it (`*.test.ts`). Each track
   adds one Playwright spec in `e2e/` for its own screen when one exists.
7. **Definition of done:** `npm run check` passes and `npm run build` passes. Then
   commit, merge to `main`, and tick the session in the Status table above.

---

## Session 0b: data foundation (blocks the tracks)

```text
Context: RadPilot repo (Next.js 16, Supabase, modular monolith). Read AGENTS.md,
docs/sessions.md and the migrations in supabase/migrations/ first. Session 0 is
committed. Your job is Session 0b in docs/sessions.md.

Do:
1. supabase/seed.sql (runs on `supabase db reset`, as postgres, so RLS is bypassed).
   Use fixed UUIDs (valid v4 shape, e.g. 10000000-0000-4000-8000-0000000000NN for
   patients, 2... studies, 3... templates, 4... reports, a... users).
   - Two demo users in auth.users + auth.identities (password "radpilot-demo",
     bcrypt via extensions.crypt):
     radiologist@radpilot.test "Dr. Alex Morgan" (radiologist) and
     admin@radpilot.test "Dr. Sam Rivera" (then set role = 'admin' in profiles).
   - 6 templates whose JSON matches TemplateSchema exactly: ct-chest, ct-head,
     ct-abdomen-pelvis, cr-chest, us-thyroid, mg-breast. Each has default
     Technique text, Comparison "None.", realistic normal_text for findings and
     impression (mg-breast: "BI-RADS 1: Negative." + a recommendation), and 1-3 macros.
   - 10 synthetic patients and studies, study_date relative to now() so the
     worklist always looks fresh, each built to demo a feature:
     1 CT chest (CTA) STAT, F 58, suspected PE -> critical finding; dicom ct-chest-phantom
     2 CT chest routine, M 64, incidental right lung nodule, 30 pack-years -> Fleischner; ct-chest-phantom
     3 CR chest STAT, M 71, after left subclavian line, rule out pneumothorax; cr-chest-pneumothorax
     4 CR chest routine, F 45, pre-op -> already FINAL, signed, normal report (FHIR/PDF demo); cr-chest-normal
     5 CT head STAT, M 82, fall on anticoagulation -> hemorrhage critical, laterality; ct-head-phantom
     6 CT abdomen/pelvis urgent, F 27, right lower quadrant pain -> laterality + sex checks
     7 CT abdomen/pelvis routine, M 59, cirrhosis, HCC surveillance -> LI-RADS
     8 US thyroid routine, F 39, palpable left thyroid nodule -> TI-RADS, laterality
     9 MG breast routine, F 52, screening -> BI-RADS
     10 CT abdomen/pelvis urgent, M 68, painless hematuria -> sex-mismatch demo
   - The final report for study 4 must be inserted as status 'final' with
     signed_by/signed_at set. The triggers will write its version, audit event and
     study status.
2. A Vitest test that extracts the template and report JSON from seed.sql and
   parses it with TemplateSchema and ReportContentSchema, so the seed can't drift
   from the domain.
3. scripts/generate-phantom-dicom.ts (npm run dicom:generate): a tiny dependency-free
   DICOM Part 10 writer (Explicit VR Little Endian) that writes synthetic phantoms
   to supabase/dicom/<series>/ (gitignored), plus a manifest.json per series that
   lists the instances in order. Series:
   - ct-chest-phantom: 40 axial slices, 256x256, 1.4 mm pixels, 5 mm slices, HU
     with intercept -1024. Contrast-filled pulmonary arteries with a filling
     defect in the right one, and an 8 mm nodule in the right lower lobe
     (patient right = image left).
   - ct-head-phantom: 24 slices, a skull ring, brain at 35 HU, CSF ventricles, and
     a right convexity subdural crescent at 70 HU.
   - cr-chest-normal and cr-chest-pneumothorax: 512x512, 12-bit, MONOCHROME2.
     The pneumothorax image has a left apical lung edge with no lung markings
     lateral to it.
   Include the tags Cornerstone needs: SOP class and instance UIDs (2.25.<int>
   from a hash), study, series and frame-of-reference UIDs, ImagePositionPatient,
   ImageOrientationPatient, PixelSpacing, Rows/Columns, BitsAllocated/Stored,
   PixelRepresentation, Rescale, WindowCenter/Width. Verify the output with
   dicom-parser in a Vitest test.
4. scripts/upload-dicom.ts (npm run dicom:upload): uploads supabase/dicom/** to the
   private `dicom` bucket with the service role, using content type
   application/dicom and application/json. Load .env.local with process.loadEnvFile.
5. Run `npm run db:start`, `npm run db:reset`, then `npm run db:types` to replace the
   `any` stub in src/lib/supabase/database.types.ts.
6. Row mappers each track needs: src/modules/<m>/infrastructure/mappers.ts for
   studies (+ patient → WorklistItem), templates, reports, and copilot (snake_case
   rows → domain objects, parsed with the zod schemas), with tests.
7. README "Getting started": brew install supabase/tap/supabase, cp .env.example
   .env.local, npm run db:start, fill the keys, npm run db:reset, npm run
   dicom:generate, npm run dicom:upload, npm run dev, then log in as the demo user.
Done when: `npm run check` passes and the local stack starts with seeded data.
Commit to main.
```

## Docs session (parallel, any time)

```text
Context: RadPilot repo. Read docs/sessions.md, the plan summary in it, the domain
files in src/modules/*/domain and supabase/migrations/. Write documentation that
doubles as interview prep. Be precise, cite the code paths, no filler.

Write:
- docs/domain-primer.md: radiology workflow (order → study → worklist → read →
  report → sign → deliver), a glossary (PACS, DICOM, modality, accession, HL7/FHIR,
  DiagnosticReport, Observation, laterality, critical finding, preliminary,
  final, addendum/amended, BI-RADS, TI-RADS, LI-RADS, Fleischner, W/L), and the
  pain points RadPilot targets.
- docs/architecture.md: the modular monolith, the 4 layers, public entry points
  and the ESLint rules that enforce them, module map, data model, the DB-enforced
  invariants (see sessions.md), key flows (streaming generation, hybrid copilot,
  lifecycle, viewer→report, export) with mermaid diagrams.
- docs/adr/0001-modular-monolith.md, 0002-llm-provider-port.md,
  0003-hybrid-copilot.md, 0004-phi-policy.md (synthetic data only; no PHI in
  logs; what a production version would need for HIPAA and LGPD: BAA/DPA with
  the LLM vendor, zero data retention, de-identification, audit, access control),
  0005-report-content-model.md (canonical ReportContent vs Tiptap JSON and why),
  0006-db-enforced-invariants.md (triggers and RLS as the last line of defense).
  Use the short ADR format: Context, Decision, Consequences, Alternatives.
Commit to main (docs/ only).
```

## Track A: auth, app shell, worklist

```text
Context: RadPilot repo, branch track/a-worklist in its own worktree. Read AGENTS.md
(Next.js 16 differs from your training data: read node_modules/next/dist/docs before
writing Next code; middleware is now src/proxy.ts) and docs/sessions.md first.
You own: src/modules/studies/**, src/app/(auth)/**, src/app/(app)/layout.tsx,
src/app/(app)/worklist/**, src/proxy.ts, src/app/page.tsx.

Build:
1. Supabase auth with email/password: login page, logout, and session refresh in
   src/proxy.ts using @supabase/ssr. Redirect signed-out users to /login. Seed
   users: radiologist@radpilot.test / radpilot-demo.
2. App shell: top bar with the app name, user menu and a "Synthetic data, not for
   clinical use" badge, built with the existing shadcn/ui components.
3. Worklist (/worklist), a Server Component: a table of WorklistItem sorted by
   compareWorklistOrder, with columns for priority badge (STAT red), patient name,
   age/sex, accession, modality, description, indication, study time (relative),
   status and assignee. Filters by status and modality (URL search params) and
   "Assigned to me". Claim and release actions as Server Functions (RLS allows
   claiming unassigned studies). Clicking a row goes to /studies/[id] (Session 5
   builds that page; leave a stub).
4. src/modules/studies/application: listWorklist, claimStudy, releaseStudy behind a
   StudyRepository port; infrastructure: a Supabase implementation.
5. Tests: Vitest for the application use cases with an in-memory repository, and a
   Playwright spec for log in → worklist shows STAT studies first → claim one.
Done when: npm run check + npm run build pass. Merge to main.
```

## Track B: templates, AI core, editor and streaming generation

```text
Context: RadPilot repo, branch track/b-editor-ai in its own worktree. Read AGENTS.md
(Next.js 16: read node_modules/next/dist/docs before writing Next code) and
docs/sessions.md. You own: src/modules/templates/**, src/modules/ai/**, the editor
parts of src/modules/reports/** (ui/, application/ for create/save/generate),
src/app/api/generate/**.

Build:
1. templates: TemplateRepository (Supabase), getTemplateForStudy (selectTemplate),
   macro expansion in the editor, and the "normal report" button (applyNormalReport).
2. ai: an LLMProvider port with streamReport() and reviewReport(). Adapters: OpenAI and
   Anthropic via the Vercel AI SDK v6 (streamObject with GeneratedReportSchema), and
   a deterministic Mock that turns shorthand like "RLL 8mm solid nodule, no
   effusion" into a plausible report with no network. Choose the adapter from
   getServerEnv().AI_PROVIDER. Add a versioned prompt registry
   (src/modules/ai/application/prompts/report-draft.v1.ts) whose input is the
   template sections, exam context (modality, body part, indication, patient
   sex/age) and the shorthand. Log every call to ai_generations (prompt_version,
   provider, model, latency, tokens, outcome), and update the outcome when sections
   are accepted or edited. Never log prompt text with logger.
3. reports (editor half): createReport (createReportContent from the template),
   autosave with optimistic concurrency on reports.version, and a Tiptap editor
   whose nodes are the template sections and which converts to and from
   ReportContent. AI text is visually marked while ai.review is "pending", with
   Accept / Regenerate per section. Editing pending text marks it "edited".
4. A streaming endpoint (route handler) that streams the partial object into the
   editor section by section.
5. Tests: Mock provider determinism, prompt building, ReportContent ↔ Tiptap
   round-trip, and the use cases with in-memory ports. Install jsdom +
   @testing-library/react only if you test components.
Done when: npm run check + npm run build pass and, with AI_PROVIDER=mock, typing
shorthand streams a full draft. Merge to main.
```

## Track C: copilot, guidelines, lifecycle

```text
Context: RadPilot repo, branch track/c-copilot-lifecycle in its own worktree. Read
AGENTS.md and docs/sessions.md (especially the DB-enforced invariants). You own:
src/modules/copilot/**, src/modules/guidelines/**, src/modules/audit/**, the
lifecycle parts of src/modules/reports/** (application/sign, amend,
mark-preliminary).

Build:
1. guidelines (pure, fully unit-tested, simplified, each with a source citation in
   a comment): Fleischner 2017 for incidental solid nodules (size, single/multiple,
   low/high risk → follow-up text), BI-RADS 0-6 category → management text,
   ACR TI-RADS points → TR level → FNA/follow-up thresholds, LI-RADS (simplified
   CT/MR major features → LR category).
2. copilot rules engine: CopilotRule implementations over RuleContext, each with
   its own tests:
   - laterality-conflict (left/right disagreement between indication, findings and
     impression for the same organ)
   - sex-mismatch (prostate/uterus/ovary vs patient sex)
   - finding-missing-from-impression (significant findings absent from the impression)
   - critical-finding (PE, pneumothorax, intracranial hemorrhage, free air,
     aortic dissection → set is_critical, blocking until acknowledged)
   - measurement-units (numbers without units, implausible sizes)
   - guideline suggestion (nodule detected → Fleischner recommendation as an
     "append" fix)
   Include a pure applyFix(content, fix).
3. LLM review: a CopilotReviewer port (Track B's LLMProvider.reviewReport, or a
   local interface you agree on via a stub) that returns CopilotIssueDraft[].
   The Mock returns nothing.
4. CopilotService: run rules + LLM, replace open issues in copilot_issues, resolve
   or apply fixes, and record audit events.
5. Lifecycle use cases: markPreliminary, signReport (app-level gate:
   missingRequiredSections, pendingAiSections, open blocking issues, giving
   friendly messages before the DB trigger fires), amendReport, and a version
   history query.
6. Copilot panel UI (src/modules/copilot/ui): an issue list grouped by severity,
   with one-click fix, dismiss (non-blocking) and a critical banner.
Done when: npm run check + npm run build pass. Merge to main.
```

## Track D: DICOM viewer, FHIR and PDF

```text
Context: RadPilot repo, branch track/d-viewer-interop in its own worktree. Read
AGENTS.md (Next.js 16: read node_modules/next/dist/docs before writing Next code)
and docs/sessions.md. You own: src/modules/interop/**, a new
src/modules/viewer/** (add it to the module list in docs/sessions.md),
src/app/api/fhir/**, src/app/api/reports/[id]/pdf/**.

Build:
1. Viewer: install @cornerstonejs/dicom-image-loader (on your Mac). It is a
   client-only component (dynamic import, ssr: false) that loads a series from the
   private `dicom` bucket through signed URLs (manifest.json lists the instances).
   Features: stack scroll, window/level presets (lung -600/1500, mediastinum
   40/400, bone 400/1800, brain 40/80), zoom/pan, length tool, and an "Insert
   into Findings" button. It emits a typed measurement event, e.g.
   { text: "8 mm, series 3 image 42" }, that Session 5 wires to the editor.
2. interop/domain: a pure mapper from Report + Study + Patient + Template to a
   FHIR R4 Bundle with DiagnosticReport (status final/amended → final/amended,
   code from modality/body part, conclusion = impression, presentedForm
   text/plain base64) and Observations for findings, plus a minimal structural
   validator. Snapshot and unit tests.
3. GET /api/fhir/DiagnosticReport/[reportId] → application/fhir+json, only for
   final or amended reports, recording a report.exported audit event.
4. PDF: @react-pdf/renderer document (header with the synthetic-data notice,
   patient/exam block, sections in template order, signature line and critical
   flag), served at GET /api/reports/[id]/pdf.
Done when: npm run check + npm run build pass and the seeded final report (study 4)
exports to valid FHIR and PDF. Merge to main.
```

## Session 5: glue, evals, polish

```text
Context: RadPilot repo after Tracks A-D merged. Read docs/sessions.md.
Build:
1. Reading room /studies/[id]: a resizable split with the viewer on the left, the
   editor in the middle and the copilot panel on the right. Wire viewer
   measurement → editor Findings, editor changes → debounced copilot run, Sign →
   lifecycle, and Export buttons.
2. evals/: 15-20 golden cases (shorthand + exam context + expected properties),
   scorers (required sections present, laterality preserved, every impression item
   traces to a finding, a recommendation present when a guideline applies), and
   npm run eval printing a table and a pass rate for the configured provider.
3. Playwright happy path: login → worklist → open study 2 → generate → fix a
   copilot issue → sign → export FHIR.
4. Seed reset script, README polish, docs/demo-script.md (a 5-minute interview demo).
Done when: everything is green and the demo runs end to end with AI_PROVIDER=mock.
```
