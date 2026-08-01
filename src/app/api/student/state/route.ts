// The student's single source of truth. Returns the current stage and — when
// a round is live — the student's CURRENT question WITHOUT the correct
// answer. Timing uses the server clock (question_served_at).
import { NextResponse } from "next/server";
import { currentStudent } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { seededShuffle } from "@/lib/shuffle";

export const dynamic = "force-dynamic";

export async function GET() {
  const student = await currentStudent();
  if (!student) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const db = supabaseAdmin();

  const [{ data: state }, { count: registered }, { data: scoreRow }] = await Promise.all([
    db.from("program_state").select("*").eq("id", 1).single(),
    db.from("students").select("id", { count: "exact", head: true }).eq("status", "active").eq("is_demo", false),
    db.from("student_scores").select("*").eq("student_id", student.id).maybeSingle()
  ]);

  const base: Record<string, unknown> = {
    student: { name: student.full_name, student_id: student.student_id, school: student.school },
    stage: state!.current_stage,
    state,
    registered: registered ?? 0,
    score: scoreRow ?? { round_1_score: 0, round_2_score: 0, round_3_score: 0, total_score: 0, correct_count: 0 }
  };

  // Live rank
  const { data: rankRow } = await db.from("ceo_ranking").select("rank").eq("student_id", student.id).maybeSingle();
  base.rank = rankRow?.rank ?? null;

  base.eliminatedAfterRound = student.eliminated_after_round ?? null;

  // Students who left the CEO race no longer receive questions — they see a
  // supportive holding screen and rejoin the story at the draft.
  if (student.eliminated_after_round &&
      ["round_live", "round_paused", "between_rounds"].includes(state!.current_stage)) {
    base.eliminatedView = true;
    return NextResponse.json(base);
  }

  if (state!.current_stage === "round_live" || state!.current_stage === "round_paused") {
    const { data: round } = await db.from("rounds").select("*").eq("round_number", state!.current_round).single();
    const { data: qs } = await db.from("questions")
      .select("id, question_en, question_ar, options, display_order")
      .eq("round_id", round!.id).eq("active", true).order("display_order");
    // Per-student deterministic shuffle: unique order per student, stable
    // across refreshes, and identical to the order the answer route validates.
    const shuffled = seededShuffle(qs!, `${student.id}:${round!.id}`);

    let { data: prog } = await db.from("student_progress")
      .select("*").eq("student_id", student.id).eq("round_id", round!.id).maybeSingle();
    if (!prog) {
      const ins = await db.from("student_progress").insert({
        student_id: student.id, round_id: round!.id, current_index: 0,
        question_served_at: new Date().toISOString()
      }).select("*").single();
      prog = ins.data;
    }

    const total = shuffled.length;
    if (prog!.completed || prog!.current_index >= total) {
      base.roundView = { done: true, roundNumber: round!.round_number, title: round!.title, titleAr: round!.title_ar, total };
    } else {
      if (!prog!.question_served_at) {
        const served = new Date().toISOString();
        await db.from("student_progress").update({ question_served_at: served }).eq("id", prog!.id);
        prog!.question_served_at = served;
      }
      const q = shuffled[prog!.current_index];
      const servedMs = new Date(prog!.question_served_at!).getTime();
      const remaining = Math.max(0, round!.time_per_question - Math.floor((Date.now() - servedMs) / 1000));
      base.roundView = {
        done: false,
        roundNumber: round!.round_number,
        title: round!.title, titleAr: round!.title_ar,
        paused: state!.current_stage === "round_paused",
        questionNumber: prog!.current_index + 1,
        total,
        pointsPerQuestion: round!.points_per_question,
        timePerQuestion: round!.time_per_question,
        secondsRemaining: remaining,
        question: { id: q.id, en: q.question_en, ar: q.question_ar, options: q.options }
        // note: correct_answer is deliberately never selected here
      };
    }
  }

  if (state!.current_stage === "ceo_reveal" || state!.current_stage === "draft" || state!.current_stage === "teams_final") {
    const { data: teams } = await db.from("teams").select("id, startup_number, pillar, ceo_student_id, students!teams_ceo_student_id_fkey(full_name, school)").order("startup_number");
    const { data: members } = await db.from("team_members").select("team_id, draft_order, position, students(full_name, school, student_id)").order("draft_order");
    base.teams = teams ?? [];
    base.members = members ?? [];
    const mine = (members ?? []).find(m => (m.students as any)?.student_id === student.student_id);
    base.myTeamId = mine?.team_id ?? null;
  }

  return NextResponse.json(base);
}
