# VENTURE — Day 1 Live App

A production-ready, bilingual (EN/AR) live event platform for a venture & startup camp: three timed elimination rounds (60 → 45 → 30 → 15), a live leaderboard, a cinematic Top-15 CEO reveal, a snake team draft into 15 startups of 4 (CEO + Technical Lead + Design & Research Lead + Business & Marketing Lead) with AI-computed private position suggestions, and IGCF pillar assignment — for ~60 students on phones, with facilitators running the show from a protected admin dashboard.

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · Supabase (Postgres, Auth, Realtime, Row-Level Security)

---

## Security model (read this first)

The Facilitator Panel is not a hidden screen — it does not exist for anyone who is not signed in as an admin.

- **Admin auth** is Supabase Auth (bcrypt-hashed passwords). Sessions live in **HTTP-only cookies** — never localStorage. Middleware guards every `/admin` and `/api/admin` route; each page re-verifies the role server-side; each API route calls `requireAdmin(minRole)` before touching data.
- **No secrets in the frontend.** The service-role key and session secret exist only in server environment variables. The build was scanned: no server secrets or correct answers appear in student-facing client bundles.
- **RLS is the boundary.** Anonymous browsers can read exactly two things: the `program_state` row (stage flags) and the `leaderboard_public` view — which returns rows only while a facilitator has made the leaderboard visible. Questions, answers, students, and teams have **no** anon policies and **no** write policies for any browser role. Calling admin actions from DevTools returns 401/403 from the server, and the database refuses regardless.
- **Server-side scoring.** The browser sends a question id + chosen option. The server compares against `questions.correct_answer` (never sent to students), stamps timing from the server clock, and `unique(student_id, question_id)` makes double submission impossible. Refreshing resumes the current question with the remaining time.
- **Audit log.** Every round control, score correction, disqualification, draft action, reset, and admin-account change writes an `audit_logs` row.
- **Destructive actions** (Reset Program) require Super Admin + typing `RESET VENTURE` + a second confirm button.
- Admins are signed out automatically after **60 minutes of inactivity** (see `INACTIVITY_MINUTES` in `src/middleware.ts`).
- Admin login is rate-limited; inputs are validated and stripped of angle brackets; React escapes all output; SQL goes through Supabase's parameterized client (no string-built SQL anywhere).

## Roles

| Role | Can do |
|---|---|
| **Super Admin** | Everything: rounds, students, teams, question bank, admin accounts, demo mode, reset |
| **Facilitator** | Run the program: rounds, leaderboard, CEO reveal, draft, student management, exports |
| **Viewer** | Read-only dashboards, leaderboard, teams, exports |

---

## Setup (≈15 minutes)

### 1. Create the Supabase project
1. [supabase.com](https://supabase.com) → New project.
2. SQL Editor → paste and run `supabase/migrations/0001_schema.sql`, then `supabase/migrations/0002_teams15_roles.sql`.
3. Project Settings → API: copy the **URL**, **anon key**, and **service_role key**.

### 2. Configure environment
```bash
cp .env.example .env.local
# fill in the three Supabase values, then:
openssl rand -hex 32   # → STUDENT_SESSION_SECRET
```

### 3. Install, seed, bootstrap
```bash
npm install
npm run seed            # loads the 3 rounds + 50 bilingual questions (idempotent)

BOOTSTRAP_ADMIN_EMAIL=you@school.ae \
BOOTSTRAP_ADMIN_PASSWORD='a-strong-password' \
BOOTSTRAP_ADMIN_NAME='Your Name' \
npm run create-admin    # creates the first Super Admin — no public signup exists
```

### 4. Run
```bash
npm run dev             # http://localhost:3000
```
- Students: `/` → name, Student ID, school → waiting room.
- Admins: **Admin Login** in the header → `/admin/dashboard`.

### 5. Deploy (Vercel recommended)
1. Push to GitHub → import in Vercel.
2. Add the four env vars from `.env.local` (never commit them).
3. Deploy. Supabase Realtime and cookies work as-is; cookies are `Secure` in production.

Any Node host works: `npm run build && npm start`.

---

## Running the event day

1. Doors open — students join at the site URL, waiting room shows the live count.
2. Dashboard → **Start Round 1 / 2 / 3** — every connected phone flips into the round instantly (Realtime; an 8-second poll covers dropped Wi-Fi).
3. **Pause/Resume** freezes timers fairly (the current question re-serves fresh on resume). **End round** parks everyone on their score screen.
4. **Open live leaderboard** and put `/leaderboard` on the projector (full-screen button, hide-IDs toggle, school filter, search).
5. **Ending each round applies the elimination cut automatically**: Round 1 keeps the top 45 in the CEO race, Round 2 the top 30, Round 3 the top 15 (same tie-breakers throughout: total → R3 → R2 → R1 → fastest response). Students who leave the race see a supportive "you're in the draft pool" screen and stay in the event.
6. **Reveal Top 15 CEOs** — the top 15 still-in-race students, ranked. At this moment the platform also privately computes every student's suggested position (Technical / Design & Research / Business & Marketing) from which role-tagged questions they answered correctly, tie-broken by speed. Suggestions appear ONLY on the admin draft board — never to students.
7. **Open CEO team draft** → Draft & Teams page. Pick order snakes 1→15, 15→1, 1→15 (3 picks per team = 45 picks, everyone placed). Each pick auto-assigns the student's suggested seat if it's free, else the best open seat; you can change any member's position or move them between teams. Undo and lock are one click; duplicates and 5-member teams are impossible (server + DB checks). Students watch live but cannot control it.
8. Assign IGCF pillars (auto-balanced — 15 teams over 5 pillars lands exactly 3 each — or manual) and lock.
9. **Reveal final teams** — each student sees their startup and everyone's position first, with all 15 viewable and a print/download summary.
10. Export anything as CSV: students, scores, answers, CEOs, teams, question bank, audit log.

**Demo Mode** (Super Admin): generate 60 clearly-marked `DEMO-###` students with plausible scores to rehearse the cuts, the CEO reveal, and the draft, then "Remove demo data only" — real records untouched.

---

## Project map

```
supabase/migrations/0001_schema.sql   schema, RLS policies, views, functions
scripts/question-bank.mjs             the 50-question EN/AR bank (seed source)
scripts/seed-questions.mjs            npm run seed
scripts/create-super-admin.mjs        npm run create-admin
src/middleware.ts                     /admin guard + inactivity timeout
src/lib/auth.ts                       requireAdmin(), student session cookies, rate limit
src/lib/supabase/{server,admin,client}.ts
src/app/page.tsx                      student login
src/app/play/page.tsx                 waiting room → quiz → results → reveal → teams
src/app/leaderboard/page.tsx          projector leaderboard
src/app/admin/login/page.tsx          admin sign-in (no public registration)
src/app/admin/(protected)/            dashboard, students, draft, questions, accounts
src/app/api/student/*                 join, state, answer (server-scored)
src/app/api/admin/*                   program, draft, students, questions, accounts, demo, export
```

## Acceptance tests → where each is satisfied

1. Student registers → waiting room: `/` + `api/student/join`
2. Student can't reach `/admin/dashboard`: middleware redirect + server layout check
3. Admin Login opens a secure page: `/admin/login`
4. Invalid credentials rejected: Supabase Auth + clear error + rate limit
5. Facilitator reaches dashboard: role check in `requireAdmin` / layout
6. Viewer can't start/reset rounds: `requireAdmin("facilitator"/"super_admin")` returns 403
7. Facilitator starts a round: `api/admin/program`
8. All students enter live: Realtime on `program_state`
9. Scores saved per answer: `api/student/answer` + `recompute_score`
10. Refresh keeps progress: server-side `student_progress` + signed cookie
11. Only admins reveal CEOs: `reveal_ceos` behind facilitator role
12. Tie-breakers & cuts: `ceo_ranking` view (total → R3 → R2 → R1 → response time), used for both eliminations and the CEO reveal
13. Draft blocks duplicates: `unique(team_members.student_id)`
14. Only admins modify teams: `api/admin/draft` role-gated
15. Reset needs strong confirmation: typed `RESET VENTURE` + super admin
16. Score edits audit-logged: `student.correct_score` requires a reason
17. Logout removes access: cookie clearing + middleware
18. No admin secrets in frontend source: env-only, verified by bundle scan
19. DevTools can't trigger admin functions: server role checks + RLS
20. Mobile/tablet/desktop/projector: responsive Tailwind layout throughout
