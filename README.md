# RadPilot

AI-native radiology reporting MVP: a worklist, a DICOM viewer next to a structured report
editor, streaming AI report generation from shorthand findings, and a hybrid copilot
(deterministic safety rules + LLM review + guideline calculators). It exports FHIR R4
and PDF.

> Demo project. **Synthetic data only. Not for clinical use.**

**Stack:** Next.js 16 (App Router) · TypeScript · Supabase (Postgres, Auth, Storage,
RLS) · Vercel AI SDK · Tiptap · Cornerstone3D · shadcn/ui + Tailwind v4 · Vitest ·
Playwright.

## Status

Built in sessions. See [docs/sessions.md](docs/sessions.md) for what is done, what's
next, and a ready-to-paste prompt for each remaining session.

## Getting started (local)

Requires Node 22 and the Supabase CLI (`brew install supabase/tap/supabase`, with Docker
running).

```bash
npm install
cp .env.example .env.local      # fill in the keys printed by the next command
npm run db:start                # local Supabase (API on :54321, Studio on :54323)
npm run db:reset                # apply migrations (+ seed, from Session 0b)
npm run dev                     # http://localhost:3000
```

## Scripts

| Script | What it does |
|---|---|
| `npm run check` | typecheck + lint + unit tests |
| `npm run test` / `test:watch` | Vitest |
| `npm run test:e2e` | Playwright (starts the dev server) |
| `npm run eval` | AI eval suite (Session 5) |
| `npm run db:start` / `db:stop` / `db:reset` | local Supabase |
| `npm run db:types` | regenerate `src/lib/supabase/database.types.ts` |
| `npm run dicom:generate` / `dicom:upload` | synthetic phantom DICOM (Session 0b) |

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
```
