-- Row Level Security.
--
-- MVP model: one radiology group. Every signed-in user (role `authenticated`)
-- with a profile can read clinical data. Writes are narrowed per table:
--   * column-level grants stop privilege escalation (e.g. a user editing their own role)
--   * history tables (report_versions) have no client write path at all; triggers write them
--   * a report can only be signed by the signed-in user, in their own name
-- `anon` gets nothing. The service role bypasses RLS (scripts only).

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.studies enable row level security;
alter table public.templates enable row level security;
alter table public.reports enable row level security;
alter table public.report_versions enable row level security;
alter table public.ai_generations enable row level security;
alter table public.copilot_issues enable row level security;
alter table public.audit_events enable row level security;

-- Start from no table access for API roles, then grant what each table needs.
revoke all on
  public.profiles, public.patients, public.studies, public.templates, public.reports,
  public.report_versions, public.ai_generations, public.copilot_issues, public.audit_events
from anon, authenticated;

-- profiles ------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

create policy "profiles: signed-in users read all"
  on public.profiles for select to authenticated using (true);

create policy "profiles: users update their own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- patients (read-only from the app) ------------------------------------------
grant select on public.patients to authenticated;

create policy "patients: signed-in users read"
  on public.patients for select to authenticated using (true);

-- studies ---------------------------------------------------------------------
-- Status is maintained by trigger, so clients may only change the assignment.
grant select on public.studies to authenticated;
grant update (assigned_to) on public.studies to authenticated;

create policy "studies: signed-in users read"
  on public.studies for select to authenticated using (true);

create policy "studies: claim or release, admins reassign"
  on public.studies for update to authenticated
  using (assigned_to is null or assigned_to = (select auth.uid()) or (select public.is_admin()))
  with check (assigned_to is null or assigned_to = (select auth.uid()) or (select public.is_admin()));

-- templates -------------------------------------------------------------------
grant select on public.templates to authenticated;
grant insert, update, delete on public.templates to authenticated;

create policy "templates: signed-in users read"
  on public.templates for select to authenticated using (true);

create policy "templates: admins insert"
  on public.templates for insert to authenticated with check ((select public.is_admin()));

create policy "templates: admins update"
  on public.templates for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "templates: admins delete"
  on public.templates for delete to authenticated using ((select public.is_admin()));

-- reports ---------------------------------------------------------------------
-- No delete. Lifecycle rules live in the reports_before_update trigger.
grant select on public.reports to authenticated;
grant insert (id, study_id, template_id, content, is_critical, created_by) on public.reports to authenticated;
grant update (template_id, status, content, is_critical, signed_by, signed_at) on public.reports to authenticated;

create policy "reports: signed-in users read"
  on public.reports for select to authenticated using (true);

create policy "reports: create drafts as yourself"
  on public.reports for insert to authenticated
  with check (created_by = (select auth.uid()) and status = 'draft');

create policy "reports: edit, and sign only in your own name"
  on public.reports for update to authenticated
  using (true)
  with check (status <> 'final' or signed_by = (select auth.uid()));

-- report_versions (written by trigger only) -------------------------------------
grant select on public.report_versions to authenticated;

create policy "report_versions: signed-in users read"
  on public.report_versions for select to authenticated using (true);

-- ai_generations ----------------------------------------------------------------
grant select on public.ai_generations to authenticated;
grant insert (id, report_id, kind, prompt_version, provider, model, input, output, latency_ms,
              input_tokens, output_tokens, outcome, error, created_by)
  on public.ai_generations to authenticated;
grant update (report_id, output, latency_ms, input_tokens, output_tokens, outcome, error)
  on public.ai_generations to authenticated;

create policy "ai_generations: signed-in users read"
  on public.ai_generations for select to authenticated using (true);

create policy "ai_generations: log as yourself"
  on public.ai_generations for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy "ai_generations: complete your own"
  on public.ai_generations for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

-- copilot_issues ------------------------------------------------------------------
grant select, delete on public.copilot_issues to authenticated;
grant insert (id, report_id, source, rule_id, severity, category, message, span, suggested_fix)
  on public.copilot_issues to authenticated;
grant update (resolved, resolved_by, resolved_at) on public.copilot_issues to authenticated;

create policy "copilot_issues: signed-in users read"
  on public.copilot_issues for select to authenticated using (true);

create policy "copilot_issues: create"
  on public.copilot_issues for insert to authenticated with check (true);

create policy "copilot_issues: resolve as yourself"
  on public.copilot_issues for update to authenticated
  using (true)
  with check (not resolved or resolved_by = (select auth.uid()));

-- Re-running a review replaces open issues; resolved ones are kept as history.
create policy "copilot_issues: delete open issues"
  on public.copilot_issues for delete to authenticated using (not resolved);

-- audit_events (append-only) -------------------------------------------------------
grant select on public.audit_events to authenticated;
grant insert (actor_id, entity, entity_id, action, payload) on public.audit_events to authenticated;

create policy "audit_events: signed-in users read"
  on public.audit_events for select to authenticated using (true);

create policy "audit_events: append as yourself"
  on public.audit_events for insert to authenticated
  with check (actor_id = (select auth.uid()));
