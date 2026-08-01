// Demo Mode — Super Admin only. Demo students carry is_demo=true so they
// can be wiped without touching real records.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";

const FIRST = ["Aisha","Omar","Layla","Yousef","Mariam","Khalid","Noor","Hamdan","Sara","Zayed","Hessa","Rashid","Fatima","Saif","Dana","Majid","Reem","Tariq","Lina","Adel"];
const LAST = ["Al Nuaimi","Al Shamsi","Haddad","Al Qasimi","Farouk","Bin Ali","Mansour","Al Zarooni","Karim","Al Suwaidi"];
const SCHOOLS = ["ASCS Sharjah","Victoria International","GEMS Wellington","Al Ittihad School","Sharjah American Intl"];

export async function POST(req: NextRequest) {
  const gate = await requireAdmin("super_admin");
  if (gate instanceof NextResponse) return gate;
  const admin = gate;
  const db = supabaseAdmin();
  const { action } = await req.json().catch(() => ({}));

  if (action === "generate") {
    // A full-fidelity rehearsal: 60 demo students who ANSWERED every question
    // with a personal role bias — so scores, elimination cuts, position
    // suggestions, and the AI assistant all behave exactly like the real day.
    const rows = Array.from({ length: 60 }, (_, i) => ({
      full_name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]} (DEMO)`,
      student_id: `DEMO-${String(i + 1).padStart(3, "0")}`,
      school: SCHOOLS[i % SCHOOLS.length],
      is_demo: true
    }));
    const { data: students, error } = await db.from("students")
      .upsert(rows, { onConflict: "student_id" }).select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const { data: questions } = await db.from("questions")
      .select("id, correct_answer, role_focus").eq("active", true);
    const ROLES = ["tech", "design", "business"];

    // Wipe any previous demo answers, then bulk-insert fresh ones.
    await db.from("student_answers").delete().in("student_id", students!.map(s => s.id));

    const answerRows: any[] = [];
    students!.forEach((s, i) => {
      const strongRole = ROLES[i % 3];               // each student leans one way
      const skill = 0.35 + Math.random() * 0.4;      // overall ability spread
      for (const q of questions ?? []) {
        const pCorrect = Math.min(0.95, skill + (q.role_focus === strongRole ? 0.25 : 0));
        const isCorrect = Math.random() < pCorrect;
        answerRows.push({
          student_id: s.id,
          question_id: q.id,
          selected_answer: isCorrect ? q.correct_answer : (q.correct_answer + 1) % 4,
          is_correct: isCorrect,
          points_awarded: isCorrect ? 10 : 0,
          response_time_ms: 4000 + Math.floor(Math.random() * 20000),
          submitted_at: new Date().toISOString()
        });
      }
    });
    for (let i = 0; i < answerRows.length; i += 500) {
      const { error: aErr } = await db.from("student_answers").insert(answerRows.slice(i, i + 500));
      if (aErr) return NextResponse.json({ error: aErr.message }, { status: 400 });
    }

    // Recompute all scores in parallel, then apply the elimination story:
    // ranks 46–60 out after R1, 31–45 after R2, 16–30 after R3, top 15 in.
    await Promise.all(students!.map(s => db.rpc("recompute_score", { p_student: s.id })));
    const { data: ranked } = await db.from("ceo_ranking").select("student_id, rank").order("rank");
    const cuts: [number, number, number][] = [[46, 60, 1], [31, 45, 2], [16, 30, 3]];
    await Promise.all((ranked ?? []).map(r => {
      const cut = cuts.find(([a, b]) => r.rank >= a && r.rank <= b);
      return db.from("students").update({ eliminated_after_round: cut ? cut[2] : null }).eq("id", r.student_id);
    }));

    await audit({ admin_id: admin.id, action: "demo.generate", new_value: { count: 60, answers: answerRows.length } });
    return NextResponse.json({ ok: true, created: students!.length });
  }

  if (action === "clear") {
    const { data: demos } = await db.from("students").select("id").eq("is_demo", true);
    const ids = (demos ?? []).map(d => d.id);
    if (ids.length) {
      await db.from("students").delete().in("id", ids); // cascades to answers/scores/teams
    }
    await audit({ admin_id: admin.id, action: "demo.clear", new_value: { removed: ids.length } });
    return NextResponse.json({ ok: true, removed: ids.length });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
