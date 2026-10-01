# RadPilot: handoff context for a new Claude session

Paste this into a new session (or point it at this file) to continue the work.
Last updated: 2026-10-01, at commit `941d060` on `main` (pushed).

## 1. Project and owner

- **RadPilot** is an AI-native radiology reporting MVP and an interview portfolio piece
  for **Marcus** (GitHub `mvmmarcus`, timezone America/Sao_Paulo). He'll share the repo
  and the live demo with recruiters when it's done.
- **Features:**
  - a worklist
  - a DICOM viewer next to a structured report editor
  - streaming AI report generation from shorthand findings
  - a hybrid copilot: deterministic safety rules, plus LLM review, plus guideline
    calculators (Fleischner, BI-RADS, TI-RADS, LI-RADS)
  - sign/amend lifecycle with an audit trail
  - FHIR R4 DiagnosticReport and PDF export
- **Synthetic data only. Not for clinical use.**
- **Working style:** for operational tasks (accounts, dashboards, terminal commands),
  Marcus wants **one small step at a time**:
  - say exactly what to click or run
  - say what he should see
  - ask him to paste the output before moving on
- **Never ask him to paste secrets.** Fill env files with commands, or have him paste
  keys into TextEdit (`open -e .env.local`).

## 2. Where everything lives

| Thing | Location |
|---|---|
| Local repo | `/Users/marcus/Documents/radpilot` (Mac) |
| GitHub | `git@github.com:mvmmarcus/radpilot.git`, **private** until done |
| Production | https://radpilot.vercel.app (auto-deploys on push to `main`; Vercel team `mvmmarcus-projects`) |
| Hosted Supabase | project ref `jzceqdcakwaaxblslsiz`, region São Paulo (sa-east-1), Free plan |
| Local Supabase | `npm run db:start` (Docker Desktop must be running: `open -a Docker`). API :54321, Studio :54323 |
| Key docs | `docs/sessions.md` (plan, contracts, rules, ready-to-paste prompts per session), `docs/setup.md` (environment setup), `README.md` |

## 3. Status

| Session | Scope | Status |
|---|---|---|
| 0 | Scaffold, module skeleton, zod env, Vitest/Playwright configs, shared domain types, migrations + RLS | done (`7caf21f`) |
| 0b | Seed (2 users, 6 templates, 10 studies, 1 final report), phantom DICOM generator/uploader, generated DB types, row mappers | done (`782fad2`) |
| Setup | Local Supabase, OpenAI, hosted Supabase (migrated + seeded + DICOM uploaded), GitHub, Vercel | done (`8fbd4d1` … `941d060`) |
| Docs | Domain primer, architecture, ADRs 0001–0006 | not started (can run any time) |
| A | Auth, app shell, worklist | next |
| B | Templates, AI provider port, Tiptap editor + streaming generation | next |
| C | Copilot rules, guidelines, sign/amend lifecycle | next |
| D | DICOM viewer, FHIR R4 + PDF | next |
| 5 | Reading room glue, evals, Playwright happy path, demo script | after A–D |

**Verified green:**

- `npm run verify:setup`, both local and `-- --env .env.production.local --live-ai`
- `npm run build` on the Mac
- `https://radpilot.vercel.app/api/health` returns
  `{"ok":true,"supabase":true,"aiProvider":"openai","aiModel":"gpt-4.1-mini","aiKeyConfigured":true}`

## 4. Stack and architecture

- **Stack:** Next.js 16.3 (App Router; *middleware is now `src/proxy.ts`*; read
  `node_modules/next/dist/docs/` before writing Next code, per `AGENTS.md`), React 19.2,
  TypeScript, Tailwind v4, shadcn/ui (`radix-nova` style; `cn` comes from shadcn's `cn`
  package), Supabase (`@supabase/ssr` 0.12), Vercel AI SDK v6 (`ai`, `@ai-sdk/openai`,
  `@ai-sdk/anthropic`), Tiptap v3, Cornerstone3D v5, zod v4, Vitest 4, Playwright,
  Supabase CLI 2.119 as a devDependency (`npx supabase …`).
- **Modular monolith.** `src/modules/{studies,templates,reports,ai,copilot,guidelines,interop,audit}/`,
  each with `domain/` (pure, framework-free), `application/` (use cases depending on
  ports), `infrastructure/` (Supabase repositories, LLM adapters, mappers) and `ui/`.
- **Public entry points, enforced by ESLint `no-restricted-imports`:**
  - `@/modules/<m>`: domain only, safe on client and server
  - `@/modules/<m>/server`: server-only use cases and mappers
  - `@/modules/<m>/ui`: React components
  - Inside a module, use relative imports. `domain/` may not import React, Next,
    Supabase, the AI SDK, Tiptap, Cornerstone or `@/lib/*`.
- **Shared contracts:** listed in full in `docs/sessions.md`. The core ones:
  - **`ReportContent`** is the canonical, editor-independent report form:
    `{ schemaVersion: 1, sections: Partial<Record<SectionKey, { text, source: human|template|ai, ai: { generationId, review: pending|accepted|edited } | null }>> }`.
    Tiptap maps to and from it.
  - **Status machine:** `REPORT_TRANSITIONS` / `nextStatus`.
  - **Copilot:** `CopilotIssue` / `CopilotIssueDraft` / `CopilotRule` / `RuleContext`.
  - **AI:** `GeneratedReportSchema` (`{ technique, findings[], impression[], recommendations[] }`).
- **Lib:**
  - `src/lib/env.ts`: zod env; `AI_PROVIDER` is `mock|openai|anthropic`, default `mock`
  - `src/lib/supabase/{client,server,admin,mapping,database.types}.ts`
  - `src/lib/logger.ts`: no PHI in logs
  - `src/app/api/health/route.ts`: returns booleans only
- **Database** (`supabase/migrations/`): schema, RLS with column-level grants, and a
  private `dicom` bucket. The database enforces these invariants by trigger and RLS:
  - lifecycle transitions are valid (draft→preliminary→final, draft→final, final→amended→final)
  - a final report is locked until amended
  - signing fails while AI text is pending or a blocking copilot issue is open
  - you can only sign in your own name
  - `reports.version` is bumped on every update (optimistic concurrency)
  - `report_versions` and `audit_events` are written by trigger on insert and on every status change
  - `studies.status` mirrors the report status
  - `audit_events` is append-only
  - clients may only change `studies.assigned_to`

## 5. Environments and secrets

- **`.env.local`:** local Supabase URL and keys, `AI_PROVIDER=mock`,
  `AI_MODEL=gpt-4.1-mini`, `OPENAI_API_KEY`.
- **`.env.production.local`:** hosted URL, publishable key, secret key (for scripts
  only), `AI_PROVIDER=openai`, the model and the OpenAI key.
- Both files are gitignored. Only `.env.example` is tracked.
- **Vercel env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `AI_PROVIDER=openai`, `AI_MODEL=gpt-4.1-mini`, `OPENAI_API_KEY`. The service role key
  is **not** in Vercel, on purpose. `NEXT_PUBLIC_*` values are baked in at build time,
  so redeploy after changing them.
- **Demo logins:** `radiologist@radpilot.test` and `admin@radpilot.test`, password
  `radpilot-demo`. The password is written in the seed and README.
- **Hosted Supabase choices:**
  - Data API on; "automatically expose new tables" **off**; automatic RLS **on**;
    public sign-ups **off**
  - consequence: every new table needs `enable row level security`, explicit column
    grants and policies in its migration (the rule is in `docs/sessions.md`)
- **Model choice:** `gpt-4.1-mini`. It's fast and non-reasoning, which suits streaming
  structured output. Re-evaluate with evals in Session 5. Marcus set an OpenAI
  monthly budget limit.
- Marcus asked whether the seed allows a real flow. Yes: the data is synthetic, but
  every action writes real rows. Setting `AI_PROVIDER=openai` makes real LLM calls,
  logged in `ai_generations`. Generation itself is built in Track B.

## 6. Constraints for Claude sessions (important)

- **Where commands run:** the sandbox can't reach the npm registry, and `node_modules`
  holds **macOS** binaries.
  - In the Linux sandbox, `tsc` and ESLint work, but **Vitest, `next build`, `tsx` and
    the Supabase CLI do not**.
  - Unit tests were checked with a small Node shim (type stripping, an `@/` alias
    loader and a vitest→node:test shim).
  - Ask Marcus to run `npm run check`, `npm run build` and any `npm install` in his
    Mac Terminal.
- **Network from the sandbox:** Marcus's localhost (local Supabase), `*.vercel.app` and
  OpenAI are unreachable. Have Marcus run `npm run verify:setup` or open `/api/health`
  and paste the output.
- **Git:** the sandbox has no git identity, so commit with
  `-c user.name="Marcus Vinicius Marques" -c user.email="marcus.vinicius.marques@hotmail.com"`
  and the session's attribution trailers. **Marcus pushes** (`git push`): the sandbox
  can't reach GitHub.
- **Deleting files** in the connected folder needs his approval each session.
- **His Mac:**
  - Homebrew can't install packages (Xcode 16.1 and the Command Line Tools are
    outdated), so install CLIs via npm instead.
  - Docker Desktop 29.2 is installed; start it with `open -a Docker`.
  - SSH to GitHub works. The `gh` CLI is probably not installed.

## 7. Open items

1. **Verify with Marcus that these were done** (instructions were given, completion not
   confirmed):
   - Supabase Auth URL configuration: Site URL `https://radpilot.vercel.app`;
     redirect URLs `https://radpilot.vercel.app/**` and
     `https://radpilot-*-mvmmarcus-projects.vercel.app/**`
   - Vercel Settings → Functions → region `gru1` (São Paulo)
2. **Create the track worktrees** from `main` (one folder and one branch per parallel
   chat), and copy `.env.local` into each:
   ```bash
   cd ~/Documents/radpilot && git switch main
   for t in a-worklist b-editor-ai c-copilot-lifecycle d-viewer-interop; do
     dir=../radpilot-${t%%-*}; git worktree add "$dir" -b "track/$t"
     cp .env.local "$dir/"; (cd "$dir" && npm install); done
   ```
   - Connect only that track's folder to its chat.
   - Use a different `PORT` per dev server.
   - All tracks share one local Supabase, so coordinate `db:reset`.
   - Merge order A→B→C→D, then `git merge main` into the remaining branches.
   - After merging a migration, also run `npx supabase db push` for the hosted project.
3. **Start Tracks A–D and the Docs session** with the prompts in `docs/sessions.md`.
   Track D must install `@cornerstonejs/dicom-image-loader` on the Mac.
4. **Before making the repo public:** change the hosted demo users' password (SQL on
   the hosted project:
   `update auth.users set encrypted_password = extensions.crypt('<new>', extensions.gen_salt('bf')) where email in (...)`)
   and share the login with recruiters privately.
5. Optional: update Xcode or the Command Line Tools on the Mac sometime.
