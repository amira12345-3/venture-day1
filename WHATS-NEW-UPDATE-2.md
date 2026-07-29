# Update 2 — Elimination format, 15 CEOs, teams of 4 with roles

## What changed
- **Format:** 60 students → Round 1 keeps top **45** → Round 2 keeps top **30** → Round 3 keeps top **15**, who become the CEOs (by rank). Ending a round applies the cut automatically.
- **Teams:** **15 startups × 4 members** — CEO + Technical Lead (AI & Build) + Design & Research Lead + Business & Marketing Lead.
- **Private position suggestions:** every question is tagged with a role. The platform computes each student's best-fit position from their correct answers (tie-broken by speed) and shows it **only on the admin draft board** — students never see it. Picks auto-fill the best open seat; admins can change any position.
- **Questions:** new role-balanced bank. Round 3 is now **IGCF Case Challenges** — short problem-statement scenarios across the five pillars (Sharjah/UAE context). All rounds are **30 seconds** per question.
- **Shuffling:** every student receives the questions in their own shuffled order (stable across refreshes) — screens next to each other show different questions.
- **Eliminated students** see a supportive "you're in the draft pool" screen, stay in the event, appear grayed on the leaderboard, and get drafted like everyone else.

## How to apply the update to your LIVE site (10 minutes)
1. **Database:** Supabase → SQL Editor → New query → paste the contents of
   `supabase/migrations/0002_teams15_roles.sql` → Run. (Safe on your existing data.)
2. **New questions:** on your laptop, replace your old project folder with this one,
   copy your existing `.env.local` into it, then in a terminal in the folder run:
   `npm install` and `npm run seed`
   → expect: `Seeded 3 rounds and 50 questions.`
3. **Website code:** upload the updated files to your GitHub repository
   (Add file → Upload files → drag the same two batches as before: everything except `src`, then `src`;
   committing over the old files replaces them). Vercel redeploys automatically — done in ~1 minute.
4. **Test:** open the site → join as a test student → note the new Round overview text.
   As admin, run Demo Mode and rehearse: Start R1 → End round (watch "Still in CEO race" drop to 45) → … → Reveal Top 15 CEOs → open the draft and see the suggested-position badges.
