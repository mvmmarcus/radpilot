# RadPilot

AI-native radiology reporting MVP: a worklist, a reading room with a DICOM viewer next
to a structured report editor and a copilot panel, streaming AI report generation from
shorthand findings, and a hybrid copilot (deterministic safety rules + LLM review +
guideline calculators). Reports go through a sign/amend lifecycle and export to FHIR R4
and PDF.

> Demo project. **Synthetic data only. Not for clinical use.**
>
> Live: https://radpilot.vercel.app (demo login available on request)

**Stack:** Next.js 16 (App Router) · TypeScript · Supabase (Postgres, Auth, Storage,
RLS) · Vercel AI SDK · Tiptap · Cornerstone3D · shadcn/ui + Tailwind v4 · Vitest ·
Playwright.

## Status

All sessions (0, 0b, Docs, Tracks A-D, Session 5) are done: auth and worklist, templates
and streaming AI generation, the copilot/guidelines/lifecycle, the DICOM viewer and FHIR/PDF
export, and the reading room that wires them together. See
[docs/sessions.md](docs/sessions.md) for how the work was split, and
[docs/demo-script.md](docs/demo-script.md) for a 5-minute walkthrough of the seeded studies.

## Getting started (local)

Requires Node 22 and Docker Desktop (running). The Supabase CLI is a dev dependency, installed by `npm install`.

```bash
npm install
cp .env.example .env.local
npm run db:start          # local Supabase: API :54321, Studio :54323. Prints the keys.
```

Fill `.env.local` with the values `db:start` printed (run `supabase status` to see them
again): `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (publishable or anon key) and
`SUPABASE_SERVICE_ROLE_KEY` (secret or service_role key). Then:

```bash
npm run db:reset          # apply migrations and supabase/seed.sql
npm run dicom:generate    # write the synthetic phantom DICOM to supabase/dicom/ (gitignored)
npm run dicom:upload      # upload it to the private `dicom` bucket (uses the service role key)
npm run dev               # http://localhost:3000
```

Log in as the demo radiologist: **radiologist@radpilot.test** / **radpilot-demo**
(an admin, admin@radpilot.test, has the same password).

### Demo data

`supabase/seed.sql` creates 2 users, 6 report templates (CT chest, CT head, CT
abdomen/pelvis, chest radiograph, US thyroid, mammography) and 10 synthetic studies.
Study times are relative to `now()`, so the worklist always looks fresh. Each study
exists to demo one feature:

| # | Exam | Patient | Priority | Demonstrates | Images |
|---|---|---|---|---|---|
| 1 | CTA chest | F 58 | STAT | Suspected PE: critical finding | `ct-chest-phantom` |
| 2 | CT chest | M 64 | routine | Incidental nodule, 30 pack-years: Fleischner | `ct-chest-phantom` |
| 3 | XR chest | M 71 | STAT | Left subclavian line, pneumothorax: critical + laterality | `cr-chest-pneumothorax` |
| 4 | XR chest | F 45 | routine | Already signed (final): FHIR and PDF export | `cr-chest-normal` |
| 5 | CT head | M 82 | STAT | Fall on anticoagulation, hemorrhage: critical + laterality | `ct-head-phantom` |
| 6 | CT abdomen/pelvis | F 27 | urgent | Right lower quadrant pain: laterality + sex checks | |
| 7 | CT abdomen/pelvis | M 59 | routine | Cirrhosis, HCC surveillance: LI-RADS | |
| 8 | US thyroid | F 39 | routine | Palpable left nodule: TI-RADS + laterality | |
| 9 | Mammography | F 52 | routine | Screening: BI-RADS | |
| 10 | CT abdomen/pelvis | M 68 | urgent | Hematuria: sex-mismatch check | |

The phantoms are drawn by `scripts/dicom/phantoms.ts` (a CTA chest with a right
pulmonary artery filling defect and an 8 mm right lower lobe nodule, a head CT with a
right subdural hematoma, and normal and pneumothorax chest radiographs) and written by
a small dependency-free DICOM Part 10 writer (`scripts/dicom/part10-writer.ts`).

Full walkthrough (local Supabase, OpenAI, hosted Supabase, Vercel) with a check after each
stage: [docs/setup.md](docs/setup.md). `npm run verify:setup` tells you what's missing.

### The reading room

Opening a study from the worklist (`/studies/[id]`) loads a three-pane reading room
(`src/app/(app)/studies/[id]/`):

- **Viewer** (left) — Cornerstone3D stack viewer loaded from the seeded DICOM bucket,
  with window/level presets, zoom/pan, stack scroll and a length tool. "Insert into
  Findings" appends the measurement to the report's Findings section.
- **Editor** (middle) — the Tiptap report editor. "Generate draft" streams an AI draft
  from shorthand findings into the AI-assisted sections; edits autosave (debounced,
  optimistic concurrency on `reports.version`).
- **Copilot** (right) — every edit re-runs the deterministic rules engine (and the LLM
  reviewer, when wired) after a short debounce; one-click fix, dismiss, and a blocking
  banner for critical findings.

The header has **Sign** (runs the sign gate first, with a friendly message if blocked),
**Mark preliminary**, **Amend** (once final) and, once the report is final or amended,
**Export FHIR** / **Export PDF** links to the Track D routes.

Panels are resizable (shadcn's `resizable`, wrapping `react-resizable-panels`).

## Scripts

| Script | What it does |
|---|---|
| `npm run check` | typecheck + lint + unit tests |
| `npm run test` / `test:watch` | Vitest |
| `npm run test:e2e` | Playwright, including the reading-room happy path (`e2e/reading-room.spec.ts`) |
| `npm run eval` | AI eval suite: 18 golden cases scored against the configured `LLMProvider` (`evals/`) |
| `npm run db:start` / `db:stop` / `db:reset` | local Supabase (reset re-applies migrations + seed, the "reset to demo state" script) |
| `npm run verify:setup` | check env, Supabase, seed, DICOM storage and OpenAI (`-- --env <file>`, `-- --live-ai`) |
| `npm run db:types` | regenerate `src/lib/supabase/database.types.ts` |
| `npm run dicom:generate` / `dicom:upload` | write the phantom DICOM series / upload them to Storage |

## Layout

```
src/
  app/                 thin routes: call module use cases only
  lib/                 env (zod), Supabase clients, logger
  modules/<name>/
    domain/            pure types, zod schemas, rules (no frameworks)
    application/       use cases, depend on ports
    infrastructure/    Supabase repositories, LLM adapters, mappers
    ui/                React components
    index.ts           public domain entry point  -> @/modules/<name>
    server.ts          server-only entry point    -> @/modules/<name>/server
supabase/migrations/   schema, RLS, storage (invariants enforced in the DB)
supabase/seed.sql      demo users, templates, synthetic patients and studies
scripts/               phantom DICOM generator and uploader
evals/                 golden cases, scorers and the eval runner (npm run eval)
e2e/                   Playwright specs
```
