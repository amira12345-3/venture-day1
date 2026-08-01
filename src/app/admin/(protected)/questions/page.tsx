import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { QuestionActions, RoundSettings } from "./actions";

export const dynamic = "force-dynamic";

export default async function Questions() {
  const admin = (await currentAdmin())!;
  if (admin.role !== "super_admin") redirect("/admin/dashboard");
  const db = supabaseAdmin();

  const { data: rounds } = await db.from("rounds").select("*").order("round_number");
  const { data: questions } = await db.from("questions")
    .select("id, round_id, legacy_id, question_en, question_ar, options, correct_answer, pillar, display_order, active")
    .order("display_order");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">Question bank</h1>
        <a href="/api/admin/export?type=questions" className="text-sm underline text-gold-deep font-medium">Export question bank CSV</a>
      </div>
      {(rounds ?? []).map(r => (
        <section key={r.id} className="bg-surface rounded-card shadow-card p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{r.title}</h2>
            <RoundSettings round={r} />
          </div>
          <ul className="divide-y divide-sand text-sm">
            {(questions ?? []).filter(q => q.round_id === r.id).map(q => (
              <li key={q.id} className={`py-2 flex items-start justify-between gap-3 ${q.active ? "" : "opacity-40"}`}>
                <div>
                  <span className="text-mute font-mono text-xs mr-2">{q.legacy_id ?? "·"}</span>
                  {q.question_en}
                  {q.pillar && <span className="ml-2 text-xs bg-gold-pale rounded-full px-2 py-0.5">{q.pillar}</span>}
                </div>
                <QuestionActions question={q} roundId={r.id} />
              </li>
            ))}
          </ul>
          <QuestionActions roundId={r.id} addNew />
        </section>
      ))}
      <p className="text-xs text-mute">Correct answers are only ever visible here and in the database — never in the student app's source. Preview the quiz any time via "Student view" (join with a test ID).</p>
    </div>
  );
}
