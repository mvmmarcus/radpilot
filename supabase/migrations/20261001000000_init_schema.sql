-- RadPilot initial schema.
-- Synthetic data only. See docs/adr/0004-phi-policy.md.
--
-- Invariants enforced here (not only in the app), so no client can bypass them:
--   * report status transitions follow the lifecycle diagram
--   * a final report's content is immutable until it is amended
--   * a report cannot be signed with AI text pending review or open blocking copilot issues
--   * every report insert and status change writes a report_versions snapshot and an audit event
--   * audit_events is append-only

-- ---------------------------------------------------------------------------
-- Enums (mirror the zod enums in src/modules/*/domain)
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('radiologist', 'admin');
create type public.patient_sex as enum ('F', 'M', 'O', 'U');
create type public.modality as enum ('CT', 'MR', 'CR', 'US', 'MG');
create type public.study_priority as enum ('stat', 'urgent', 'routine');
create type public.study_status as enum ('unread', 'in_progress', 'preliminary', 'final');
create type public.report_status as enum ('draft', 'preliminary', 'final', 'amended');
create type public.ai_generation_kind as enum ('report_draft', 'copilot_review');
create type public.ai_generation_outcome as enum ('pending', 'accepted', 'edited', 'rejected', 'error');
create type public.copilot_issue_source as enum ('rule', 'llm', 'guideline');
create type public.copilot_issue_severity as enum ('blocking', 'warning', 'info');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'radiologist',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- patients (synthetic)
-- ---------------------------------------------------------------------------
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  mrn text not null unique,
  full_name text not null,
  sex public.patient_sex not null,
  birth_date date not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- studies: one imaging exam, one worklist row
-- ---------------------------------------------------------------------------
create table public.studies (
  id uuid primary key default gen_random_uuid(),
  accession text not null unique,
  patient_id uuid not null references public.patients (id) on delete restrict,
  modality public.modality not null,
  body_part text not null
    check (body_part in ('head', 'chest', 'abdomen_pelvis', 'thyroid', 'breast')),
  description text not null default '',
  indication text not null default '',
  priority public.study_priority not null default 'routine',
  -- Kept in sync with the report status by reports_sync_study_status().
  status public.study_status not null default 'unread',
  study_date timestamptz not null default now(),
  -- Folder prefix in the `dicom` Storage bucket. Null when the study has no images.
  dicom_path text,
  assigned_to uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index studies_worklist_idx on public.studies (status, priority, study_date);
create index studies_assigned_to_idx on public.studies (assigned_to);
create index studies_patient_id_idx on public.studies (patient_id);

create trigger studies_set_updated_at
  before update on public.studies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- templates: section schema, macros and normal-report text per exam type
-- ---------------------------------------------------------------------------
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  modality public.modality not null,
  body_part text not null
    check (body_part in ('head', 'chest', 'abdomen_pelvis', 'thyroid', 'breast')),
  sections jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array'),
  macros jsonb not null default '[]'::jsonb check (jsonb_typeof(macros) = 'array'),
  normal_text jsonb not null default '{}'::jsonb check (jsonb_typeof(normal_text) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (modality, body_part)
);

create trigger templates_set_updated_at
  before update on public.templates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- reports: one per study. `content` is ReportContent (src/modules/reports/domain/content.ts)
-- ---------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null unique references public.studies (id) on delete cascade,
  template_id uuid not null references public.templates (id) on delete restrict,
  status public.report_status not null default 'draft',
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  is_critical boolean not null default false,
  -- Bumped by trigger on every update. Clients pass the version they read
  -- (`... where id = $1 and version = $2`) for optimistic concurrency.
  version integer not null default 1 check (version > 0),
  created_by uuid references public.profiles (id) on delete set null,
  signed_by uuid references public.profiles (id) on delete restrict,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_final_is_signed
    check (status <> 'final' or (signed_by is not null and signed_at is not null))
);

-- report_versions: immutable snapshots. Written only by triggers.
create table public.report_versions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  version integer not null,
  status public.report_status not null,
  content jsonb not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (report_id, version)
);

-- ---------------------------------------------------------------------------
-- ai_generations: every model call, for audit, evals and the acceptance-rate metric
-- ---------------------------------------------------------------------------
create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports (id) on delete set null,
  kind public.ai_generation_kind not null,
  prompt_version text not null,
  provider text not null,
  model text not null,
  input jsonb not null,
  output jsonb,
  latency_ms integer check (latency_ms >= 0),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  outcome public.ai_generation_outcome not null default 'pending',
  error text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index ai_generations_report_id_idx on public.ai_generations (report_id);
create index ai_generations_created_at_idx on public.ai_generations (created_at);

-- ---------------------------------------------------------------------------
-- copilot_issues: findings of the rules engine, LLM review and guideline calculators
-- ---------------------------------------------------------------------------
create table public.copilot_issues (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  source public.copilot_issue_source not null,
  rule_id text,
  severity public.copilot_issue_severity not null,
  category text not null check (category in (
    'laterality', 'sex_mismatch', 'missing_from_impression', 'critical_finding',
    'measurement', 'guideline', 'clarity', 'other'
  )),
  message text not null,
  span jsonb,
  suggested_fix jsonb,
  resolved boolean not null default false,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index copilot_issues_open_idx on public.copilot_issues (report_id) where not resolved;

-- ---------------------------------------------------------------------------
-- audit_events: append-only log
-- ---------------------------------------------------------------------------
create table public.audit_events (
  id bigint generated always as identity primary key,
  -- No foreign key on purpose: the log must survive profile deletion untouched.
  actor_id uuid,
  entity text not null check (entity in ('study', 'report', 'template', 'ai_generation', 'copilot_issue')),
  entity_id uuid not null,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_entity_idx on public.audit_events (entity, entity_id, created_at);

create or replace function public.prevent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_events_no_update_delete
  before update or delete on public.audit_events
  for each row execute function public.prevent_mutation();

-- Snapshots are never edited. (Deleting a report still cascades to its versions.)
create trigger report_versions_no_update
  before update on public.report_versions
  for each row execute function public.prevent_mutation();

-- ---------------------------------------------------------------------------
-- Report lifecycle invariants
-- ---------------------------------------------------------------------------
create or replace function public.reports_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.study_id is distinct from old.study_id then
    raise exception 'reports.study_id is immutable' using errcode = 'check_violation';
  end if;

  -- Allowed transitions (same table as REPORT_TRANSITIONS in reports/domain/status.ts).
  if new.status is distinct from old.status
     and (old.status::text, new.status::text) not in (
       ('draft', 'preliminary'),
       ('draft', 'final'),
       ('preliminary', 'final'),
       ('final', 'amended'),
       ('amended', 'final')
     ) then
    raise exception 'Invalid report status transition: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  -- A signed report is locked. Amend it first (final -> amended), then edit.
  if old.status = 'final'
     and (new.content is distinct from old.content
          or new.template_id is distinct from old.template_id
          or new.is_critical is distinct from old.is_critical) then
    raise exception 'Report % is final. Amend it before changing it.', old.id
      using errcode = 'check_violation';
  end if;

  -- Signing gate.
  if new.status = 'final' and old.status <> 'final' then
    if jsonb_path_exists(new.content, '$.sections.* ? (@.ai.review == "pending")') then
      raise exception 'Cannot sign: AI-generated text is still pending review'
        using errcode = 'check_violation';
    end if;
    if exists (
      select 1 from public.copilot_issues ci
      where ci.report_id = new.id and ci.severity = 'blocking' and not ci.resolved
    ) then
      raise exception 'Cannot sign: open blocking copilot issues'
        using errcode = 'check_violation';
    end if;
  end if;

  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger reports_before_update
  before update on public.reports
  for each row execute function public.reports_before_update();

-- Snapshot + audit on create and on every status change. SECURITY DEFINER so
-- the history tables need no client write access at all.
create or replace function public.reports_write_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := coalesce(auth.uid(), new.created_by);
  audit_action text;
begin
  insert into public.report_versions (report_id, version, status, content, created_by)
  values (new.id, new.version, new.status, new.content, actor);

  if tg_op = 'INSERT' then
    audit_action := 'report.created';
  elsif new.status = 'final' then
    audit_action := 'report.signed';
  elsif new.status = 'amended' then
    audit_action := 'report.amended';
  else
    audit_action := 'report.status_changed';
  end if;

  insert into public.audit_events (actor_id, entity, entity_id, action, payload)
  values (
    actor, 'report', new.id, audit_action,
    jsonb_build_object(
      'from', case when tg_op = 'UPDATE' then old.status end,
      'to', new.status,
      'version', new.version,
      'study_id', new.study_id
    )
  );
  return null;
end;
$$;

create trigger reports_history_on_insert
  after insert on public.reports
  for each row execute function public.reports_write_history();

create trigger reports_history_on_status_change
  after update of status on public.reports
  for each row
  when (old.status is distinct from new.status)
  execute function public.reports_write_history();

-- Study worklist status mirrors the report status.
create or replace function public.reports_sync_study_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.studies
  set status = case new.status
    when 'draft' then 'in_progress'
    when 'preliminary' then 'preliminary'
    when 'final' then 'final'
    when 'amended' then 'in_progress'
  end::public.study_status
  where id = new.study_id;
  return null;
end;
$$;

create trigger reports_sync_study_status
  after insert or update of status on public.reports
  for each row execute function public.reports_sync_study_status();
