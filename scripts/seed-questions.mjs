// Seeds rounds + the 50-question bank. Idempotent (upserts by round_number / legacy_id).
// Usage:  node scripts/seed-questions.mjs   (reads .env / .env.local)
import { createClient } from "@supabase/supabase-js";
import { ROUNDS, QUESTIONS } from "./question-bank.mjs";
import { readFileSync, existsSync } from "node:fs";

for (const f of [".env.local", ".env"]) {
  if (existsSync(f)) for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: rounds, error: rErr } = await db.from("rounds")
  .upsert(ROUNDS, { onConflict: "round_number" }).select();
if (rErr) { console.error(rErr); process.exit(1); }
const byNumber = Object.fromEntries(rounds.map(r => [r.round_number, r.id]));

const rows = QUESTIONS.map((q, i) => ({
  round_id: byNumber[q.r],
  legacy_id: q.id,
  question_en: q.q,
  question_ar: q.qAr,
  options: q.options,
  correct_answer: q.answer,
  pillar: q.pillar ?? null,
  role_focus: q.role ?? null,
  display_order: i,
  active: true
}));
const { error: qErr } = await db.from("questions").upsert(rows, { onConflict: "legacy_id" });
if (qErr) { console.error(qErr); process.exit(1); }
console.log(`Seeded ${rounds.length} rounds and ${rows.length} questions.`);
