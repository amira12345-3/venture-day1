// AI Draft Assistant — suggestion only, never auto-picks.
// The CEO (via the facilitator screen) describes their project idea; the
// assistant recommends who to draft for each OPEN seat on the on-clock team,
// using each available student's real per-role answer statistics.
//
// Works out of the box with a built-in recommender. If ANTHROPIC_API_KEY is
// set in the environment, Claude writes the reasoning instead — same data,
// richer explanations. Falls back to the built-in logic on any API error.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { POSITION_LABEL } from "@/lib/types";

const ROLE_KEYWORDS: Record<string, string[]> = {
  tech: ["app", "ai", "code", "build", "platform", "robot", "sensor", "data", "model", "website", "system", "automation", "iot", "vision", "تطبيق", "ذكاء", "برمجة", "نظام", "بيانات"],
  design: ["design", "research", "user", "ux", "interview", "prototype", "experience", "usability", "brand", "تصميم", "بحث", "مستخدم", "تجربة"],
  business: ["market", "sell", "customer", "revenue", "price", "pitch", "money", "growth", "partnership", "sponsor", "تسويق", "بيع", "عميل", "إيراد", "شراكة"]
};

export async function POST(req: NextRequest) {
  const gate = await requireAdmin("facilitator");
  if (gate instanceof NextResponse) return gate;
  const db = supabaseAdmin();

  const body = await req.json().catch(() => ({}));
  const startupNumber = Number(body.startup_number);
  const idea = String(body.idea ?? "").slice(0, 600);
  if (!startupNumber || !idea.trim()) {
    return NextResponse.json({ error: "Describe the project idea first." }, { status: 400 });
  }

  // On-clock team: which seats are still open?
  const { data: team } = await db.from("teams").select("id").eq("startup_number", startupNumber).single();
  if (!team) return NextResponse.json({ error: "Team not found." }, { status: 404 });
  const { data: members } = await db.from("team_members").select("position").eq("team_id", team.id);
  const taken = new Set((members ?? []).map(m => m.position));
  const openSeats = ["tech", "design", "business"].filter(r => !taken.has(r));
  if (!openSeats.length) return NextResponse.json({ error: "This team is already full." }, { status: 409 });

  // Available pool with real per-role performance.
  const [{ data: drafted }, { data: pool }, { data: answers }] = await Promise.all([
    db.from("team_members").select("student_id"),
    db.from("students").select("id, full_name, school, suggested_role, student_scores(total_score)").eq("status", "active"),
    db.from("student_answers").select("student_id, is_correct, response_time_ms, questions(role_focus)")
  ]);
  const onTeam = new Set((drafted ?? []).map(d => d.student_id));
  const available = (pool ?? []).filter(s => !onTeam.has(s.id));
  if (!available.length) return NextResponse.json({ error: "The pool is empty." }, { status: 409 });

  const stats: Record<string, Record<string, { c: number; n: number; t: number }>> = {};
  for (const a of answers ?? []) {
    const role = (a.questions as any)?.role_focus;
    if (!role || onTeam.has(a.student_id)) continue;
    const row = (stats[a.student_id] ??= {});
    const cell = (row[role] ??= { c: 0, n: 0, t: 0 });
    if (a.is_correct) cell.c += 1;
    cell.n += 1; cell.t += a.response_time_ms ?? 0;
  }

  // Idea → role emphasis from keywords (a tech-heavy idea weighs the tech seat, etc.)
  const ideaLower = idea.toLowerCase();
  const emphasis: Record<string, number> = { tech: 1, design: 1, business: 1 };
  for (const [role, words] of Object.entries(ROLE_KEYWORDS)) {
    for (const w of words) if (ideaLower.includes(w)) emphasis[role] += 0.15;
  }

  // Built-in recommender: for each open seat, rank the pool by real accuracy
  // in that role (weighted by the idea), speed as tie-breaker.
  const used = new Set<string>();
  const recommendations = openSeats.map(seat => {
    const ranked = available
      .filter(s => !used.has(s.id))
      .map(s => {
        const cell = stats[s.id]?.[seat] ?? { c: 0, n: 0, t: 0 };
        const acc = cell.n ? cell.c / cell.n : 0;
        const avgT = cell.n ? cell.t / cell.n : 999_999;
        const bonus = s.suggested_role === seat ? 0.1 : 0;
        return { s, score: (acc + bonus) * emphasis[seat], acc, correct: cell.c, avgT };
      })
      .sort((a, b) => b.score - a.score || a.avgT - b.avgT);
    const [first, second] = ranked;
    if (first) used.add(first.s.id);
    return {
      seat,
      seatLabel: POSITION_LABEL[seat as keyof typeof POSITION_LABEL],
      pick: first ? {
        name: first.s.full_name, school: first.s.school,
        reason: `Answered ${first.correct} ${seat} questions correctly (${Math.round(first.acc * 100)}% accuracy)${first.s.suggested_role === seat ? " — this is also their suggested position" : ""}.`
      } : null,
      alternate: second ? { name: second.s.full_name, reason: `${second.correct} correct in ${seat} (${Math.round(second.acc * 100)}%).` } : null
    };
  });

  // Optional: let Claude write the reasoning if a key is configured.
  let narrative: string | null = null;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 400,
          messages: [{
            role: "user",
            content: `A student CEO at a startup camp describes their project: "${idea}". Based ONLY on this data-driven shortlist ${JSON.stringify(recommendations)}, write 2-3 warm sentences (in English) explaining why this team fits their idea. Do not add names not in the list.`
          }]
        })
      });
      const data = await res.json();
      narrative = data?.content?.map((c: any) => c.text ?? "").join(" ").trim() || null;
    } catch { /* built-in reasoning already covers it */ }
  }

  return NextResponse.json({ ok: true, recommendations, narrative });
}
