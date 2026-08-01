// Scoring happens HERE, on the server, against the database's correct_answer.
// The browser only ever sends a question id + chosen option index.
//  · unique(student_id, question_id) blocks double submission
//  · response time comes from server timestamps, not client clocks
//  · a 3-second network grace period keeps slow connections fair,
//    beyond which the answer is stored as unanswered (0 points)
import { NextRequest, NextResponse } from "next/server";
import { currentStudent } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { seededShuffle } from "@/lib/shuffle";

const GRACE_MS = 3000;

export async function POST(req: NextRequest) {
  const student = await currentStudent();
  if (!student) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const questionId: string = body.question_id;
  const selected: number | null =
    Number.isInteger(body.selected_answer) && body.selected_answer >= 0 && body.selected_answer <= 3
      ? body.selected_answer : null;

  if (student.eliminated_after_round) {
    return NextResponse.json({ error: "You are no longer in the CEO race for this round." }, { status: 403 });
  }

  const db = supabaseAdmin();
  const { data: state } = await db.from("program_state").select("*").eq("id", 1).single();
  if (state!.current_stage !== "round_live") {
    return NextResponse.json({ error: "The round is not live." }, { status: 409 });
  }

  const { data: round } = await db.from("rounds").select("*").eq("round_number", state!.current_round).single();
  const { data: question } = await db.from("questions")
    .select("id, round_id, correct_answer, display_order")
    .eq("id", questionId).eq("active", true).maybeSingle();
  if (!question || question.round_id !== round!.id) {
    return NextResponse.json({ error: "Unknown question." }, { status: 400 });
  }

  const { data: prog } = await db.from("student_progress")
    .select("*").eq("student_id", student.id).eq("round_id", round!.id).single();

  // The submitted question must be the student's CURRENT one — in THEIR
  // shuffled order (same seed as the state route).
  const { data: qs } = await db.from("questions")
    .select("id").eq("round_id", round!.id).eq("active", true).order("display_order");
  const shuffled = seededShuffle(qs!, `${student.id}:${round!.id}`);
  const currentQ = shuffled[prog.current_index];
  if (!currentQ || currentQ.id !== questionId) {
    return NextResponse.json({ error: "This question was already submitted." }, { status: 409 });
  }

  const servedMs = new Date(prog.question_served_at).getTime();
  const elapsed = Date.now() - servedMs;
  const limitMs = round!.time_per_question * 1000 + GRACE_MS;
  const timedOut = elapsed > limitMs;

  const effectiveSelected = timedOut ? null : selected;
  const isCorrect = effectiveSelected !== null && effectiveSelected === question.correct_answer;
  const points = isCorrect ? round!.points_per_question : 0;

  const { error: insErr } = await db.from("student_answers").insert({
    student_id: student.id,
    question_id: questionId,
    selected_answer: effectiveSelected,
    is_correct: isCorrect,
    points_awarded: points,
    response_time_ms: Math.min(elapsed, limitMs),
    submitted_at: new Date().toISOString()
  });
  if (insErr) {
    // unique violation → duplicate; treat as already handled
    return NextResponse.json({ error: "Already submitted." }, { status: 409 });
  }

  // Advance to the next question and stamp its serve time (server clock).
  const nextIndex = prog.current_index + 1;
  const completed = nextIndex >= shuffled.length;
  await db.from("student_progress").update({
    current_index: nextIndex,
    question_served_at: completed ? null : new Date().toISOString(),
    completed
  }).eq("id", prog.id);

  await db.rpc("recompute_score", { p_student: student.id });

  return NextResponse.json({ ok: true, completed });
}
