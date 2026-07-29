-- VENTURE Day 1 — update 2: elimination format, 15 CEOs, teams of 4 with roles.
-- Run this in the Supabase SQL Editor AFTER 0001_schema.sql (safe on live data).

-- Role focus per question (drives the private position suggestions).
alter table public.questions
  add column if not exists role_focus text
  check (role_focus in ('tech','design','business'));

-- Elimination + suggested position per student.
alter table public.students
  add column if not exists eliminated_after_round int,
  add column if not exists suggested_role text
  check (suggested_role in ('tech','design','business'));

-- Team position per member (CEO or one of the three leads).
alter table public.team_members
  add column if not exists position text
  check (position in ('ceo','tech','design','business'));

-- All rounds now run 30 seconds per question.
update public.rounds set time_per_question = 30;

-- Rebuild ranking view: expose elimination status so the CEO cutoff can
-- exclude students who left the race in an earlier round.
drop view if exists public.ceo_ranking;
create view public.ceo_ranking as
  select s.id as student_id, s.full_name, s.student_id as student_code, s.school,
         s.eliminated_after_round,
         sc.total_score, sc.round_3_score, sc.round_2_score, sc.round_1_score,
         sc.total_response_time_ms,
         row_number() over (
           order by sc.total_score desc, sc.round_3_score desc,
                    sc.round_2_score desc, sc.round_1_score desc,
                    sc.total_response_time_ms asc, s.created_at asc
         ) as rank
  from public.students s
  join public.student_scores sc on sc.student_id = s.id
  where s.status = 'active';

-- Leaderboard: include elimination status so the projector can gray out
-- students who are out of the CEO race (they remain in the draft pool).
drop view if exists public.leaderboard_public;
create view public.leaderboard_public
with (security_invoker = false) as
  select s.full_name, s.student_id, s.school,
         s.eliminated_after_round,
         sc.round_1_score, sc.round_2_score, sc.round_3_score,
         sc.total_score, sc.correct_count
  from public.students s
  join public.student_scores sc on sc.student_id = s.id
  where s.status = 'active'
    and (select leaderboard_visible from public.program_state where id = 1);

grant select on public.leaderboard_public to anon, authenticated;
