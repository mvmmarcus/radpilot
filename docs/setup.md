# Setup: local Supabase, OpenAI, hosted Supabase, Vercel

Four stages, each ending with a check. Do them in order; stage 1 is enough to start
the parallel tracks, stages 3 and 4 are only needed for a public demo URL.

| Stage | Result | Check |
|---|---|---|
| 1. Local Supabase | DB + auth + storage on your Mac, seeded | `npm run verify:setup` sections 1–5 green |
| 2. OpenAI | key + model in `.env.local` | section 6 green (`-- --live-ai` for a real call) |
| 3. Hosted Supabase | cloud project with the same schema and seed | `npm run verify:setup -- --env .env.production.local` |
| 4. Vercel | public URL running against the hosted project | `https://<app>.vercel.app/api/health` returns `"ok": true` |

Secrets live only in `.env.local` / `.env.production.local` (both gitignored) and in the
Vercel dashboard. Never paste keys into a chat.

---

## 1. Local Supabase

Requires Docker Desktop with the engine running (`open -a Docker`). The Supabase CLI is a
dev dependency, so `npm install` installs it and the `npm run db:*` scripts use it (or call it
directly with `npx supabase ...`). No Homebrew needed.

```bash
cd ~/Documents/radpilot
npm install
npm run db:start                        # first run downloads images, a few minutes
```

`db:start` prints the local URL and keys (again any time with `npx supabase status`).
Create `.env.local` and fill the Supabase values straight from the CLI, without the keys
ever being shown:

```bash
cp -n .env.example .env.local
eval "$(npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
sed -i '' \
  -e "s|^NEXT_PUBLIC_SUPABASE_URL=.*|NEXT_PUBLIC_SUPABASE_URL=$API_URL|" \
  -e "s|^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=.*|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY|" \
  -e "s|^SUPABASE_SERVICE_ROLE_KEY=.*|SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY|" \
  .env.local
```

Or fill it by hand from the `npx supabase status` output:

| `.env.local` | from `supabase status` |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | API URL (`http://127.0.0.1:54321`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (`sb_publishable_...`), or the anon key on older CLIs |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key (`sb_secret_...`), or the service_role key on older CLIs |

Then load data and images:

```bash
npm run db:reset          # migrations + seed
npm run dicom:generate    # phantom DICOM -> supabase/dicom/
npm run dicom:upload      # -> private `dicom` bucket
npm run verify:setup
```

Local Studio: http://127.0.0.1:54323. Demo login: `radiologist@radpilot.test` /
`radpilot-demo` (admin: `admin@radpilot.test`).

**Worktrees:** all track worktrees share this one local stack. Copy `.env.local` into each
worktree. `db:reset` rebuilds the shared DB from the current branch's migrations, so
coordinate it.

## 2. OpenAI

1. https://platform.openai.com/api-keys → create a key in a project used only for
   RadPilot.
2. Billing → add credit and **set a monthly budget limit** (a few dollars is plenty for
   development).
3. In `.env.local`:
   ```bash
   OPENAI_API_KEY=sk-...
   AI_MODEL=<model id>
   AI_PROVIDER=mock      # keep mock for day-to-day dev and tests; switch to openai to try it
   ```
   Pick a fast, inexpensive model that supports structured outputs. If you are unsure,
   leave `AI_MODEL` empty and run the check: it lists the model ids your key can use.
4. Check:
   ```bash
   npm run verify:setup                  # validates key + model, free
   npm run verify:setup -- --live-ai     # one real ~10-token generation via the AI SDK
   ```

## 3. Hosted Supabase

1. https://supabase.com/dashboard → New project. Region close to your users and to Vercel
   (São Paulo: `sa-east-1`). Save the database password in your password manager.
2. Link and push the schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>   # ref is in the project URL
   npx supabase db push                            # applies supabase/migrations
   ```
3. Seed the demo data, either:
   - `npx supabase db push --include-seed` (CLI runs `supabase/seed.sql`), or
   - Dashboard → SQL Editor → paste `supabase/seed.sql` → Run.
4. Keys: Project Settings → API Keys. Create `.env.production.local`:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   SUPABASE_SERVICE_ROLE_KEY=sb_secret_...      # for dicom:upload only
   AI_PROVIDER=openai
   AI_MODEL=<model id>
   OPENAI_API_KEY=sk-...
   ```
5. Upload the images and check:
   ```bash
   npm run dicom:upload -- --env .env.production.local
   npm run verify:setup -- --env .env.production.local
   ```
6. Auth settings (Authentication in the dashboard):
   - **Disable new user sign-ups.** The demo uses the two seeded accounts; a public URL
     with open sign-up would let anyone create accounts.
   - URL configuration: Site URL = your Vercel production URL (after stage 4), and add
     `https://*-<your-vercel-team>.vercel.app/**` to redirect URLs for preview deploys.

Restoring the demo data later: sign in as the admin and choose **Restore demo data** in
the user menu, or run `select public.reset_demo_data();` in the SQL Editor. It also runs
every night at 07:00 UTC. It discards every study, report, AI log and audit event and
re-creates the demo set; users, templates and images are untouched.

## 4. Vercel

Vercel deploys from a Git remote, so first push the repo to a **private** GitHub repo:

```bash
gh repo create radpilot --private --source . --push     # or create it on github.com and:
# git remote add origin git@github.com:<you>/radpilot.git && git push -u origin main
```

Then https://vercel.com/new → import the repo. Framework preset: Next.js (auto). Before the
first deploy, add Environment Variables (Production and Preview):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | hosted project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | hosted publishable key |
| `AI_PROVIDER` | `openai` (or `mock` for a zero-cost demo) |
| `AI_MODEL` | your model id |
| `OPENAI_API_KEY` | mark as Sensitive |

Do **not** add `SUPABASE_SERVICE_ROLE_KEY` to Vercel: the app never needs it at runtime.
Don't use Vercel's Supabase marketplace integration either; it sets differently named
variables (`..._ANON_KEY`) than `src/lib/env.ts` expects.

Settings → Functions → region: pick the one next to your Supabase region
(São Paulo: `gru1`).

Deploy, then open `https://<app>.vercel.app/api/health`. Expect:

```json
{ "ok": true, "env": true, "supabase": true, "aiProvider": "openai", "aiKeyConfigured": true, ... }
```

Notes:
- `NEXT_PUBLIC_*` values are baked in at build time: after changing them, redeploy.
- Every pushed branch (e.g. `track/a-worklist`) gets a Preview URL against the same hosted
  database. Good for reviewing a track before merging.
- Go back to stage 3 step 6 and set the Site URL to the production URL.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `failed to connect to the docker API` | Docker engine not running: `open -a Docker`, wait for "Engine running", retry |
| `db:start` hangs or fails | `npx supabase stop --no-backup && npm run db:start` |
| `brew install` fails (Xcode / permissions) | not needed: the CLI comes from `npm install` |
| verify: sign-in failed | seed not applied: `npm run db:reset` (local) / stage 3 step 3 |
| verify: 0 series in bucket | `npm run dicom:generate && npm run dicom:upload` |
| verify: `AI_MODEL ... not available` | use one of the ids the check prints |
| OpenAI 429 | no credit or budget reached: Billing |
| `/api/health` → `env: false` | a required Vercel env var is missing or malformed; redeploy after fixing |
