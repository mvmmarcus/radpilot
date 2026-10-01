# 0006: Database-enforced invariants (triggers and RLS as the last line of defense)

## Context

RadPilot's most safety-critical rules are also the ones with the most ways to be
reached: a report's status can be changed by a Server Function in `reports/application`
today, but also potentially by a future admin tool, a background job, a bug in a new
code path added by a parallel track, or a developer running `psql`/the Supabase SQL
editor directly. Rules like "a signed report is immutable except via amendment" and
"you cannot sign while AI text is pending review or a blocking issue is open" are
exactly the kind of rule that is cheap to check in one call site and catastrophic to
have silently skipped in another. Application-level validation is necessary for good UX
(specific, friendly error messages) but is not sufficient as the *only* place a rule is
enforced, because every application-level check can be bypassed by code that forgets to
call it.

## Decision

Enforce the invariants that matter most for data integrity and patient safety **in the
database itself**, via triggers and Row Level Security, in addition to (not instead of)
application-level checks that produce friendly errors. Concretely
(`supabase/migrations/20261001000000_init_schema.sql`,
`supabase/migrations/20261001000100_rls.sql`):

- **`reports_before_update`** (a `BEFORE UPDATE` trigger) whitelists valid status
  transitions against a hardcoded pair list mirroring `REPORT_TRANSITIONS`
  (`src/modules/reports/domain/status.ts:16`), rejects content/template/criticality
  changes once `status = 'final'`, and blocks the `→ final` transition while any section
  has `ai.review = "pending"` (`jsonb_path_exists`) or any `copilot_issues` row is
  `severity = 'blocking' and not resolved`. It also unconditionally bumps `version` and
  `updated_at`, so optimistic concurrency can't be defeated by a client that forgets to
  increment it.
- **`reports_write_history`** (`AFTER INSERT` / `AFTER UPDATE OF status`,
  `SECURITY DEFINER`) writes `report_versions` and `audit_events` — tables clients hold
  **no insert/update grant on at all** for `report_versions` (only `select`,
  `supabase/migrations/20261001000100_rls.sql:106`), so there is no client code path,
  buggy or otherwise, that could write a version snapshot inconsistent with the actual
  row.
- **`reports_sync_study_status`** keeps `studies.status` derived from the report's
  status; the column-level grant on `studies` only allows clients to update
  `assigned_to` (`supabase/migrations/20261001000100_rls.sql:60`), so `studies.status`
  cannot drift from the report even if application code tries to set it directly.
- **`prevent_mutation()`** rejects any `UPDATE`/`DELETE` on `audit_events` and
  `report_versions` outright, at the trigger level — append-only is a database fact, not
  an application convention.
- **RLS policy `"reports: edit, and sign only in your own name"`** requires `signed_by =
  auth.uid()` whenever `status = 'final'` — "you can only sign as yourself" is a
  property of the authenticated session, checked server-side by Postgres, not something
  a client payload can override.
- Every new table's migration is required (per `docs/sessions.md`'s rules for every
  session) to include RLS and explicit column-level grants in the same migration that
  creates it — the hosted Supabase project does not auto-expose new tables, so a missing
  grant fails loudly (in production, not silently) rather than accidentally working via
  a permissive default.

Application code still implements the same checks ahead of the database call
(`missingRequiredSections`, `pendingAiSections`, open-blocking-issue checks in
`signReport`) purely for **UX**: a friendly, specific message before the user ever hits
a raw Postgres `check_violation`. The database is never relied upon as the *only* place
a rule is checked when a better user-facing error is possible — it's the backstop, not
the primary UX.

## Consequences

- No application bug, missing check in a new code path, or direct database access can
  violate the report lifecycle, lock a final report's immutability, bypass the signing
  gate, or tamper with the audit trail — these hold even for code the team hasn't
  written yet.
- Tests of the invariants themselves (e.g. "can't sign with a pending AI section") can
  be written directly against Postgres (a migration/RLS test) independent of whatever
  application code exists at the time, which decouples "is the rule enforced" from "is
  today's call site correct."
- Error messages from a trigger violation are necessarily less friendly than an
  application-level check (`raise exception 'Cannot sign: ...' using errcode =
  'check_violation'` vs. a typed result from `signReport`), which is why the app-level
  check is kept as the primary UX path and the trigger as the backstop — removing the
  app-level check would make failures correct but worse to experience.
- Migrations that touch these triggers are high-stakes: a change to
  `reports_before_update` needs the same scrutiny as a change to
  `REPORT_TRANSITIONS`, since the two must stay in lockstep by hand (there is no
  codegen from the zod schema to the SQL trigger) — a mismatch would mean the app
  "thinks" a transition is valid and the database rejects it (a bug, but a safe
  direction to fail in) or vice versa (a bug, and a dangerous direction, though
  not possible here since the DB is always the final check).
- Column-level grants (rather than table-level grants plus RLS alone) add a small
  amount of migration boilerplate per table but close the privilege-escalation gap RLS
  alone leaves open (e.g. without a column grant limiting `profiles` updates to
  `full_name`, RLS "users update their own profile" would still let a user set their own
  `role` to `admin`).

## Alternatives considered

- **Application-level enforcement only, with thorough test coverage.** Lower migration
  complexity and friendlier error messages everywhere, but test coverage proves today's
  code is correct, not that tomorrow's new code path (or a direct SQL session) can't
  violate the rule. Rejected as insufficient for rules where the failure mode is a
  corrupted medical record or a bypassed safety gate.
- **A single service/API gateway in front of Postgres that is the only writer, with no
  direct DB access ever permitted.** Would mean enforcement effectively happens
  "in the app," re-centralized at the gateway rather than scattered. Possible in a later
  architecture, but RadPilot already uses Supabase's direct-to-Postgres model (RLS,
  `@supabase/ssr`) for its auth and realtime story; adding a mandatory gateway layer
  would be a significant redesign for a benefit (centralized enforcement) the DB
  triggers already provide more cheaply at this scale. Rejected for now.
- **Stored procedures (RPC) as the only write path, with no direct table grants to
  clients at all.** Would centralize all write logic in SQL/PL-pgSQL functions, arguably
  even more robust. Rejected as higher-friction for this team: application code in
  TypeScript (with zod validation, friendly errors, and the existing port/adapter
  pattern in `application/`) is easier to write, test and review than growing the
  business logic itself in PL/pgSQL; triggers are reserved for the backstop invariants
  that must hold regardless of write path, not for the primary business logic.
