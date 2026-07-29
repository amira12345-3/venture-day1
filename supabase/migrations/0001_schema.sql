-- ============================================================
-- VENTURE — Day 1 Live App · Database schema + Row-Level Security
-- Run in Supabase SQL editor or via `supabase db push`.
-- ============================================================

-- ---------- Admins (linked to Supabase Auth users) ----------
create type admin_role as enum ('super_admin', 'facilitator', 'viewer');
create type admin_status as enum ('active', 'disabled');

create table public.admins (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role admin_role not null default 'viewer',
  status admin_status not null default 'active',
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- ---------- Students (no auth accounts — server-managed sessions) ----------
create type student_status as enum ('active', 'disqualified');

create table public.students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  student_id text not null unique,
  school text not null default '',
  status student_status not null default 'active',
  is_demo boolean not null default false,
  session_token_hash text,          -- sha256 of the student's session token
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index on public.students (school);
create index on public.students (is_demo);

-- ---------- Rounds ----------
create type round_status as enum ('pending', 'live', 'paused', 'ended');

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  round_number int not null unique check (round_number between 1 and 3),
  title text not null,
  title_ar text not null,
  status round_status not null default 'pending',
  started_at timestamptz,
  ended_at timestamptz,
  time_per_question int not null default 30,
  points_per_question int not null default 10
);

-- ---------- Questions (correct answers live ONLY here, behind RLS) ----------
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  legacy_id text unique,            -- e.g. r1q1, for seed idempotency
  question_en text not null,
  question_ar text not null,
  options jsonb not null,           -- array of 4 strings
  correct_answer int not null check (correct_answer between 0 and 3),
  pillar text,
  display_order int not null default 0,
  active boolean not null default true
);
create index on public.questions (round_id, display_order);

-- ---------- Per-student round progress (server timestamps drive timing) ----------
create table public.student_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  round_id uuid not null references public.rounds (id) on delete cascade,
  current_index int not null default 0,
  question_served_at timestamptz,
  completed boolean not null default false,
  unique (student_id, round_id)
);

-- ---------- Answers ----------
create table public.student_answers (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  selected_answer int,              -- null = timed out / unanswered
  is_correct boolean not null default false,
  points_awarded int not null default 0,
  response_time_ms int not null default 0,
  submitted_at timestamptz not null default now(),
  unique (student_id, question_id)  -- hard block on double submission
);
create index on public.student_answers (student_id);

-- ---------- Aggregated scores ----------
create table public.student_scores (
  student_id uuid primary key references public.students (id) on delete cascade,
  round_1_score int not null default 0,
  round_2_score int not null default 0,
  round_3_score int not null default 0,
  total_score int not null default 0,
  correct_count int not null default 0,
  total_response_time_ms bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- ---------- Teams / draft ----------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  startup_number int not null unique check (startup_number between 1 and 12),
  ceo_student_id uuid not null unique references public.students (id),
  pillar text,
  locked boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  student_id uuid not null unique references public.students (id) on delete cascade,
  draft_order int not null,         -- global pick number; 0 = CEO seat
  joined_at timestamptz not null default now()
);

-- ---------- Single-row program state (drives realtime for everyone) ----------
create table public.program_state (
  id int primary key default 1 check (id = 1),
  current_stage text not null default 'registration',
  -- registration | round_live | round_paused | between_rounds
  -- ceo_reveal | draft | teams_final
  current_round int,
  leaderboard_visible boolean not null default false,
  ceos_revealed boolean not null default false,
  draft_locked boolean not null default false,
  teams_revealed boolean not null default false,
  draft_pick_number int not null default 0,
  draft_current_team int,           -- startup_number currently on the clock
  updated_at timestamptz not null default now()
);
insert into public.program_state (id) values (1);

-- ---------- Audit log ----------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.admins (id),
  action text not null,
  entity_type text,
  entity_id text,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index on public.audit_logs (created_at desc);

-- ============================================================
-- ROW-LEVEL SECURITY
-- Strategy:
--   · service_role (server API routes only) bypasses RLS — all student
--     actions and all admin mutations are executed server-side after
--     explicit permission checks, and mutations are audit-logged.
--   · authenticated admins get read access appropriate to their role.
--   · anon (student browsers) can read ONLY the program_state row and a
--     safe leaderboard view — nothing else. Questions, answers and
--     correct answers are never readable from the browser.
-- ============================================================

alter table public.admins           enable row level security;
alter table public.students         enable row level security;
alter table public.rounds           enable row level security;
alter table public.questions        enable row level security;
alter table public.student_progress enable row level security;
alter table public.student_answers  enable row level security;
alter table public.student_scores   enable row level security;
alter table public.teams            enable row level security;
alter table public.team_members     enable row level security;
alter table public.program_state    enable row level security;
alter table public.audit_logs       enable row level security;

-- Helper: is the current auth user an active admin?
create or replace function public.is_active_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins
    where id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.admin_role_of(uid uuid)
returns admin_role language sql stable security definer set search_path = public as $$
  select role from public.admins where id = uid and status = 'active';
$$;

-- Admins: read own row; super admins read all. All writes via service role.
create policy admins_read_self on public.admins
  for select to authenticated using (id = auth.uid());
create policy admins_read_all_super on public.admins
  for select to authenticated using (public.admin_role_of(auth.uid()) = 'super_admin');

-- Admin read access to program data (any active admin role).
create policy admin_read on public.students         for select to authenticated using (public.is_active_admin());
create policy admin_read on public.rounds           for select to authenticated using (public.is_active_admin());
create policy admin_read on public.questions        for select to authenticated using (public.is_active_admin());
create policy admin_read on public.student_progress for select to authenticated using (public.is_active_admin());
create policy admin_read on public.student_answers  for select to authenticated using (public.is_active_admin());
create policy admin_read on public.student_scores   for select to authenticated using (public.is_active_admin());
create policy admin_read on public.teams            for select to authenticated using (public.is_active_admin());
create policy admin_read on public.team_members     for select to authenticated using (public.is_active_admin());
create policy admin_read on public.audit_logs       for select to authenticated using (public.is_active_admin());
create policy admin_read on public.program_state    for select to authenticated using (public.is_active_admin());

-- Anon: program_state row only (safe, non-personal flags).
create policy anon_read_state on public.program_state
  for select to anon using (true);

-- Anon: rounds metadata (titles, timing — no answers).
create policy anon_read_rounds on public.rounds for select to anon using (true);

-- NOTE: intentionally NO anon/authenticated INSERT/UPDATE/DELETE policies.
-- Every mutation flows through server API routes using the service role,
-- after role checks. Hiding buttons is not the security boundary — RLS is.

-- ---------- Safe public leaderboard view ----------
-- Exposes scores only while the admin has made the leaderboard visible,
-- and never exposes session tokens. Student IDs are included; the
-- projector UI can hide them, and admins can toggle visibility off.
create or replace view public.leaderboard_public
with (security_invoker = false) as
  select s.full_name, s.student_id, s.school,
         sc.round_1_score, sc.round_2_score, sc.round_3_score,
         sc.total_score, sc.correct_count
  from public.students s
  join public.student_scores sc on sc.student_id = s.id
  where s.status = 'active'
    and (select leaderboard_visible from public.program_state where id = 1);

grant select on public.leaderboard_public to anon, authenticated;

-- ---------- Registered-count for the waiting room ----------
create or replace view public.registration_stats
with (security_invoker = false) as
  select count(*)::int as registered
  from public.students where status = 'active' and is_demo = false;
grant select on public.registration_stats to anon, authenticated;

-- ---------- Realtime ----------
alter publication supabase_realtime add table public.program_state;
alter publication supabase_realtime add table public.student_scores;
alter publication supabase_realtime add table public.team_members;
alter publication supabase_realtime add table public.teams;

-- ---------- Score recompute (single source of truth) ----------
create or replace function public.recompute_score(p_student uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.student_scores as sc
    (student_id, round_1_score, round_2_score, round_3_score,
     total_score, correct_count, total_response_time_ms, updated_at)
  select
    p_student,
    coalesce(sum(a.points_awarded) filter (where r.round_number = 1), 0),
    coalesce(sum(a.points_awarded) filter (where r.round_number = 2), 0),
    coalesce(sum(a.points_awarded) filter (where r.round_number = 3), 0),
    coalesce(sum(a.points_awarded), 0),
    coalesce(count(*) filter (where a.is_correct), 0),
    coalesce(sum(a.response_time_ms), 0),
    now()
  from public.student_answers a
  join public.questions q on q.id = a.question_id
  join public.rounds r on r.id = q.round_id
  where a.student_id = p_student
  on conflict (student_id) do update set
    round_1_score = excluded.round_1_score,
    round_2_score = excluded.round_2_score,
    round_3_score = excluded.round_3_score,
    total_score = excluded.total_score,
    correct_count = excluded.correct_count,
    total_response_time_ms = excluded.total_response_time_ms,
    updated_at = now();
end;
$$;

-- ---------- CEO ranking with tie-breakers ----------
-- total desc → R3 desc → R2 desc → R1 desc → fastest total response time.
create or replace view public.ceo_ranking as
  select s.id as student_id, s.full_name, s.student_id as student_code, s.school,
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
