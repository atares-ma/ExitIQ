-- RLS and integrity checks. Every block raises on failure.
\set ON_ERROR_STOP on
insert into auth.users (id, is_anonymous) values
  ('11111111-1111-1111-1111-111111111111', true),
  ('22222222-2222-2222-2222-222222222222', true);

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  execute 'set role authenticated';
end $$;

-- catalogue is seeded and readable by anon
set role anon;
do $$ begin
  if (select count(*) from public.question_definitions) <> 55 then raise exception 'expected 55 controls'; end if;
  if (select count(*) from public.profile_weights) <> 48 then raise exception 'expected 48 weights'; end if;
end $$;
do $$ begin
  begin perform 1 from public.assessments; raise exception 'anon must not read assessments';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- weights sum to 100 per profile and dimension
do $$ begin
  if exists (select 1 from public.profile_weights group by profile, left(domain,1) having sum(weight) <> 100)
  then raise exception 'weights do not sum to 100'; end if;
end $$;

-- user A creates an assessment and appends answers
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into public.assessments (id, catalogue_version, scoring_version, report_version)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'catalogue-2026.11-v1', 'scoring-1.0.0', 'report-1.0.0');
insert into public.answers (assessment_id, question_id, status, points, source_version)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Q01', 'substantive', 50, 'catalogue-2026.11-v1');
insert into public.answers (assessment_id, question_id, status, points, source_version)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Q01', 'substantive', 100, 'catalogue-2026.11-v1');
insert into public.answers (assessment_id, question_id, status, value, source_version)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'E01', 'diagnostic', '["Specialist know-how"]', 'catalogue-2026.11-v1');
do $$ begin
  if (select points from public.current_answers where question_id = 'Q01') <> 100 then raise exception 'current answer wrong'; end if;
  if (select count(*) from public.answers) <> 3 then raise exception 'history not kept'; end if;
end $$;

-- substantive without points is rejected
do $$ begin
  begin
    insert into public.answers (assessment_id, question_id, status, source_version)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 'Q02', 'substantive', 'v');
    raise exception 'substantive without points accepted';
  exception when check_violation then null; end;
end $$;

-- reviewer-only states are refused for the owner
do $$ begin
  begin
    insert into public.answers (assessment_id, question_id, status, na_reason, source_version)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 'Q17', 'not_applicable_confirmed', 'x', 'v');
    raise exception 'owner confirmed N/A';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.evidence_refs (assessment_id, question_id, reference, owner_role, as_of_date, review_status, reviewer_id, reviewed_at)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 'Q21', 'x', 'CFO', current_date, 'reviewed', '11111111-1111-1111-1111-111111111111', now());
    raise exception 'owner self-certified evidence';
  exception when insufficient_privilege then null; end;
end $$;

-- answers are append-only
do $$ declare n int; begin
  update public.answers set points = 0;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'answers were updatable'; end if;
exception when insufficient_privilege then null;
end $$;

insert into public.evidence_refs (assessment_id, question_id, reference, owner_role, as_of_date, review_status)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Q21', 'Audited accounts 2023-2025', 'CFO', '2026-10-01', 'dated_reference');
insert into public.tasks (assessment_id, task_key, priority_class, title) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Q:Q02', 3, 'Timing');
update public.tasks set status = 'in_progress', agreed_due_date = '2027-01-31';
insert into public.result_snapshots (assessment_id, profile, catalogue_version, scoring_version, report_version, data_status, risk_status, result)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'OWNER', 'c', 's', 'r', 'data_incomplete', 'none', '{}');
insert into public.analytics_events (assessment_id, event, stage, broad_context, device) values ('aaaaaaaa-0000-0000-0000-000000000001', 'stage_view', 'CONTEXT', 'OWNER', 'desktop');
do $$ begin
  begin perform 1 from public.analytics_events; raise exception 'analytics readable by client';
  exception when insufficient_privilege then null; end;
end $$;

-- owner cannot hand the assessment to someone else
do $$ begin
  begin
    update public.assessments set owner_id = '22222222-2222-2222-2222-222222222222';
    raise exception 'owner changed';
  exception when raise_exception or insufficient_privilege or check_violation then
    if sqlerrm = 'owner changed' then raise; end if;
  end;
end $$;
reset role;

-- user B sees nothing of A and cannot write into A's assessment
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
do $$ begin
  if (select count(*) from public.assessments) <> 0 then raise exception 'B sees A assessment'; end if;
  if (select count(*) from public.answers) <> 0 then raise exception 'B sees A answers'; end if;
  if (select count(*) from public.current_answers) <> 0 then raise exception 'B sees A current answers'; end if;
  if (select count(*) from public.evidence_refs) <> 0 then raise exception 'B sees A evidence'; end if;
  if (select count(*) from public.tasks) <> 0 then raise exception 'B sees A tasks'; end if;
  if (select count(*) from public.result_snapshots) <> 0 then raise exception 'B sees A snapshots'; end if;
  begin
    insert into public.answers (assessment_id, question_id, status, points, source_version)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 'Q01', 'substantive', 0, 'v');
    raise exception 'B wrote into A';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.assessments (owner_id, catalogue_version, scoring_version, report_version)
      values ('11111111-1111-1111-1111-111111111111', 'c', 's', 'r');
    raise exception 'B created assessment for A';
  exception when insufficient_privilege then null; end;
  update public.tasks set status = 'done';
  delete from public.assessments;
end $$;
reset role;
do $$ begin
  if (select status from public.tasks) <> 'in_progress' then raise exception 'B changed A task'; end if;
  if (select count(*) from public.assessments) <> 1 then raise exception 'B deleted A assessment'; end if;
end $$;

-- deleting the auth user removes everything they own
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  if (select count(*) from public.answers) + (select count(*) from public.assessments) <> 0 then raise exception 'cascade failed'; end if;
end $$;

select 'RLS tests passed' as result;
