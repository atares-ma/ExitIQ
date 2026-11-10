-- ExitIQ v1 schema (Product and Implementation Brief, section 18).
--
-- Access model
--   * Every assessment belongs to exactly one auth user (owner_id). Visitors get
--     a real auth.uid() through Supabase anonymous sign-in, so ownership is
--     enforced by RLS on auth.uid() rather than on a self-asserted header.
--   * Default access is private to the owner. A respondent role is descriptive
--     and never grants access. Scoped contributors (release 2) will get their
--     own table and policies; nothing here grants cross-user access.
--   * Answers and result snapshots are append-only for clients: no UPDATE or
--     DELETE policies, so the audit trail cannot be rewritten from the browser.
--   * Statuses that need an authorised reviewer (confirmed N/A, reviewed
--     evidence, contradiction resolution) cannot be written by clients.
--
-- The question catalogue is reference data, seeded by the following migration
-- and generated from src/model/catalogue.ts.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

-- ── helpers ──────────────────────────────────────────────────────────────────

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── question catalogue (reference data) ──────────────────────────────────────

create table public.question_definitions (
  id                     text        not null,
  catalogue_version      text        not null,
  domain                 text        not null check (domain in ('S1','S2','S3','O1','O2','O3','O4','O5','T1','T2','T3','T4')),
  local_weight           smallint    not null check (local_weight between 1 and 3),
  route                  text        not null check (route in ('CORE','DEBT','CONTINGENT','REGULATED','INVESTOR_RIGHTS','EMPLOYEE_EQUITY','SEPARATION','PE_CONTEXT','CONVERTIBLE','CROSS_BORDER','ASSET_TRANSFER','PARTIAL','PRIMARY_CAPITAL','ACQUISITIONS')),
  name                   text        not null,
  question               text        not null,
  context_wording        jsonb       not null default '{}'::jsonb,
  anchors                jsonb       not null check (jsonb_typeof(anchors) = 'array' and jsonb_array_length(anchors) = 3),
  help                   text,
  evidence_request       text,
  suggested_contributor  text        not null,
  depends_on             text[]      not null default '{}',
  created_at             timestamptz not null default now(),
  primary key (catalogue_version, id)
);

comment on table public.question_definitions is
  'Registered scored controls per catalogue version. Generated from src/model/catalogue.ts; do not edit by hand.';

create table public.profile_weights (
  catalogue_version text     not null,
  profile           text     not null check (profile in ('OWNER','CORPORATE','PE','VC')),
  domain            text     not null check (domain in ('S1','S2','S3','O1','O2','O3','O4','O5','T1','T2','T3','T4')),
  weight            smallint not null check (weight between 0 and 100),
  primary key (catalogue_version, profile, domain)
);

-- ── assessments ──────────────────────────────────────────────────────────────

create table public.assessments (
  id                 uuid        primary key default gen_random_uuid(),
  owner_id           uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  stage              text        not null default 'CONTEXT'
                       check (stage in ('CONTEXT','DISCOVERY','INITIAL_PICTURE','DEEP_ASSESSMENT','RESULT','SAVED','SPECIALIST_PATH','APPLICABILITY_PENDING')),
  resume_stage       text        check (resume_stage in ('CONTEXT','DISCOVERY','INITIAL_PICTURE','DEEP_ASSESSMENT','RESULT')),
  subject            text        check (char_length(subject) <= 200),
  perimeter          text        check (perimeter in ('whole_business','subsidiary','business_unit_assets','minority_interest','undecided')),
  respondent_role    text        check (respondent_role in ('owner','management','cfo','corporate_ma','investor','adviser','other')),
  confirmed_profile  text        check (confirmed_profile in ('OWNER','CORPORATE','PE','VC')),
  ownership_tags     text[]      not null default '{}',
  objectives         text[]      not null default '{}',
  horizon            text        check (horizon in ('under_6','m6_18','m19_36','over_36','undecided')),
  jurisdictions      jsonb       not null default '{}'::jsonb,
  -- Full routing context (section 3), including UNKNOWN values. Bounded in size.
  context            jsonb       not null default '{}'::jsonb check (pg_column_size(context) <= 16384),
  -- Unscored discovery diagnostics (E01, E03, E04, E07).
  diagnostics        jsonb       not null default '{}'::jsonb check (pg_column_size(diagnostics) <= 8192),
  -- Presentation state for resumption (current screen, question index). Never used for scoring.
  ui_state           jsonb       not null default '{}'::jsonb check (pg_column_size(ui_state) <= 4096),
  active_modules     text[]      not null default '{}',
  pending_modules    text[]      not null default '{}',
  catalogue_version  text        not null,
  scoring_version    text        not null,
  report_version     text        not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index assessments_owner_idx on public.assessments (owner_id, updated_at desc);

create trigger assessments_updated_at
  before update on public.assessments
  for each row execute function private.set_updated_at();

-- Ownership never moves through an UPDATE from the client.
create or replace function private.lock_assessment_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'owner_id cannot be changed';
  end if;
  return new;
end;
$$;

create trigger assessments_lock_owner
  before update on public.assessments
  for each row execute function private.lock_assessment_owner();

-- Ownership check used by every child-table policy. SECURITY DEFINER so the
-- policies do not recurse through assessments' own RLS; it only ever answers
-- for the calling user.
create or replace function private.owns_assessment(p_assessment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.assessments a
    where a.id = p_assessment_id and a.owner_id = (select auth.uid())
  );
$$;

revoke all on function private.owns_assessment(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.owns_assessment(uuid) to authenticated;

-- ── answers (append-only history) ────────────────────────────────────────────
-- Each change appends a row; the current answer is the latest row per
-- (assessment, question). Inactive answers stay stored and are excluded from
-- calculation by the routing rules, never deleted.

create table public.answers (
  id                       uuid        primary key default gen_random_uuid(),
  assessment_id            uuid        not null references public.assessments (id) on delete cascade,
  question_id              text        not null check (question_id ~ '^(Q[0-9]{2}|E[0-9]{2})$'),
  status                   text        not null check (status in (
                               'substantive','unknown','needs_internal_confirmation','needs_adviser_review','withheld',
                               'conflicted','not_applicable_requested','not_applicable_confirmed','diagnostic','cleared')),
  option_id                text        check (char_length(option_id) <= 40),
  points                   smallint    check (points in (0, 50, 100)),
  value                    jsonb       check (value is null or pg_column_size(value) <= 2048),
  evidence_level           numeric(2,1) not null default 0 check (evidence_level in (0, 0.5, 1)),
  respondent_id            uuid        not null default auth.uid(),
  respondent_role          text,
  source_version           text        not null,
  previous_answer_id       uuid        references public.answers (id) on delete set null,
  contradiction_state      text        not null default 'none' check (contradiction_state in ('none','conflicted','resolved')),
  requires_reconfirmation  boolean     not null default false,
  inactive_since           timestamptz,
  na_reason                text        check (char_length(na_reason) <= 1000),
  created_at               timestamptz not null default now(),
  -- Scored controls: substantive <=> points present. Diagnostics carry a value instead.
  constraint answers_points_consistent check (
    (question_id like 'Q%' and ((status = 'substantive') = (points is not null)) and status <> 'diagnostic')
    or (question_id like 'E%' and points is null and status in ('diagnostic','unknown','withheld','cleared'))
  ),
  -- Confirmed N/A needs an explanation and provenance.
  constraint answers_na_reason check (status <> 'not_applicable_confirmed' or na_reason is not null)
);

create index answers_assessment_question_idx on public.answers (assessment_id, question_id, created_at desc);
create index answers_previous_idx on public.answers (previous_answer_id);

create view public.current_answers
with (security_invoker = true) as
  select distinct on (assessment_id, question_id) *
  from public.answers
  order by assessment_id, question_id, created_at desc, id desc;

comment on view public.current_answers is 'Latest answer per assessment and question. Respects answers RLS (security_invoker).';

-- ── evidence references ──────────────────────────────────────────────────────
-- A restricted reference (where the support lives, who owns it, as of when),
-- not an upload. Only an authorised reviewer may set review_status = reviewed.

create table public.evidence_refs (
  id             uuid        primary key default gen_random_uuid(),
  assessment_id  uuid        not null references public.assessments (id) on delete cascade,
  question_id    text        not null check (question_id ~ '^Q[0-9]{2}$'),
  reference      text        not null check (char_length(reference) between 1 and 500),
  owner_role     text        check (char_length(owner_role) <= 120),
  as_of_date     date,
  review_status  text        not null default 'self_reported' check (review_status in ('self_reported','dated_reference','reviewed')),
  reviewer_id    uuid        references auth.users (id),
  reviewed_at    timestamptz,
  access_scope   text        not null default 'owner' check (access_scope in ('owner','company','seller_private')),
  created_by     uuid        not null default auth.uid(),
  created_at     timestamptz not null default now(),
  constraint evidence_dated_reference check (review_status <> 'dated_reference' or (owner_role is not null and as_of_date is not null)),
  constraint evidence_reviewed check (review_status <> 'reviewed' or (reviewer_id is not null and reviewed_at is not null))
);

create index evidence_refs_assessment_idx on public.evidence_refs (assessment_id, question_id, created_at desc);
create index evidence_refs_reviewer_idx on public.evidence_refs (reviewer_id);

-- ── tasks ────────────────────────────────────────────────────────────────────

create table public.tasks (
  id                 uuid        primary key default gen_random_uuid(),
  assessment_id      uuid        not null references public.assessments (id) on delete cascade,
  task_key           text        not null check (char_length(task_key) <= 200),
  source_question_ids text[]     not null default '{}',
  rule_id            text,
  priority_class     smallint    not null check (priority_class in (1, 2, 3)),
  title              text        not null check (char_length(title) <= 300),
  reason             text        check (char_length(reason) <= 2000),
  accountable_role   text        check (char_length(accountable_role) <= 200),
  suggested_timing   text        check (char_length(suggested_timing) <= 100),
  agreed_due_date    date,
  dependencies       text[]      not null default '{}',
  evidence_required  text        check (char_length(evidence_required) <= 1000),
  status             text        not null default 'open' check (status in ('open','in_progress','done','dismissed')),
  resolution         jsonb       check (resolution is null or pg_column_size(resolution) <= 4096),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (assessment_id, task_key)
);

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function private.set_updated_at();

-- ── result snapshots (append-only) ───────────────────────────────────────────

create table public.result_snapshots (
  id                 uuid        primary key default gen_random_uuid(),
  assessment_id      uuid        not null references public.assessments (id) on delete cascade,
  profile            text        check (profile in ('OWNER','CORPORATE','PE','VC')),
  catalogue_version  text        not null,
  scoring_version    text        not null,
  report_version     text        not null,
  data_status        text        not null check (data_status in ('data_complete','data_incomplete')),
  risk_status        text        not null check (risk_status in ('critical','review','none')),
  result             jsonb       not null check (pg_column_size(result) <= 262144),
  created_at         timestamptz not null default now()
);

create index result_snapshots_assessment_idx on public.result_snapshots (assessment_id, created_at desc);

-- ── analytics (section 20: minimal metadata, no answer content) ──────────────

create table public.analytics_events (
  id             bigint      generated always as identity primary key,
  assessment_id  uuid        references public.assessments (id) on delete set null,
  user_id        uuid        default auth.uid(),
  event          text        not null check (event in (
                    'stage_view','assessment_start','theme_complete','route_change','save','resume','result_view','contact_request','export')),
  stage          text        check (char_length(stage) <= 40),
  broad_context  text        check (broad_context in ('OWNER','CORPORATE','PE','VC','UNDECIDED')),
  device         text        check (device in ('mobile','tablet','desktop')),
  channel        text        check (char_length(channel) <= 60),
  is_internal    boolean     not null default false,
  created_at     timestamptz not null default now()
);

create index analytics_events_assessment_idx on public.analytics_events (assessment_id);
create index analytics_events_created_idx on public.analytics_events (created_at);

-- ── Row Level Security ───────────────────────────────────────────────────────

alter table public.question_definitions enable row level security;
alter table public.profile_weights      enable row level security;
alter table public.assessments          enable row level security;
alter table public.answers              enable row level security;
alter table public.evidence_refs        enable row level security;
alter table public.tasks                enable row level security;
alter table public.result_snapshots     enable row level security;
alter table public.analytics_events     enable row level security;

-- Reference data: readable by everyone, written only by migrations.
create policy "catalogue is public" on public.question_definitions for select to anon, authenticated using (true);
create policy "weights are public"  on public.profile_weights      for select to anon, authenticated using (true);

-- Assessments: owner only.
create policy "owner reads assessments"   on public.assessments for select to authenticated using (owner_id = (select auth.uid()));
create policy "owner creates assessments" on public.assessments for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "owner updates assessments" on public.assessments for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owner deletes assessments" on public.assessments for delete to authenticated using (owner_id = (select auth.uid()));

-- Answers: owner reads and appends. Reviewer-only states are refused.
create policy "owner reads answers" on public.answers for select to authenticated
  using ((select private.owns_assessment(assessment_id)));
create policy "owner appends answers" on public.answers for insert to authenticated
  with check (
    (select private.owns_assessment(assessment_id))
    and respondent_id = (select auth.uid())
    and status not in ('not_applicable_confirmed', 'conflicted')
    and contradiction_state = 'none'
    and evidence_level in (0, 0.5)
  );

-- Evidence: owner reads and adds references; cannot self-certify a review.
create policy "owner reads evidence" on public.evidence_refs for select to authenticated
  using ((select private.owns_assessment(assessment_id)));
create policy "owner adds evidence" on public.evidence_refs for insert to authenticated
  with check (
    (select private.owns_assessment(assessment_id))
    and created_by = (select auth.uid())
    and review_status in ('self_reported', 'dated_reference')
    and reviewer_id is null and reviewed_at is null
  );

-- Tasks: owner maintains the plan.
create policy "owner reads tasks"   on public.tasks for select to authenticated using ((select private.owns_assessment(assessment_id)));
create policy "owner creates tasks" on public.tasks for insert to authenticated with check ((select private.owns_assessment(assessment_id)));
create policy "owner updates tasks" on public.tasks for update to authenticated
  using ((select private.owns_assessment(assessment_id))) with check ((select private.owns_assessment(assessment_id)));
create policy "owner deletes tasks" on public.tasks for delete to authenticated using ((select private.owns_assessment(assessment_id)));

-- Snapshots: owner reads and appends.
create policy "owner reads snapshots"   on public.result_snapshots for select to authenticated using ((select private.owns_assessment(assessment_id)));
create policy "owner appends snapshots" on public.result_snapshots for insert to authenticated with check ((select private.owns_assessment(assessment_id)));

-- Analytics: write-only for clients; reading is for the service role.
create policy "user records own events" on public.analytics_events for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (assessment_id is null or (select private.owns_assessment(assessment_id)))
  );

-- ── grants ───────────────────────────────────────────────────────────────────
-- Explicit, so the Data API exposes exactly this and nothing more.

revoke all on public.question_definitions, public.profile_weights, public.assessments, public.answers,
              public.evidence_refs, public.tasks, public.result_snapshots, public.analytics_events,
              public.current_answers
  from anon, authenticated;

grant select on public.question_definitions, public.profile_weights to anon, authenticated;
grant select, insert, update, delete on public.assessments to authenticated;
grant select, insert on public.answers to authenticated;
grant select on public.current_answers to authenticated;
grant select, insert on public.evidence_refs to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert on public.result_snapshots to authenticated;
grant insert on public.analytics_events to authenticated;
