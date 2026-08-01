import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { issueStudentToken, setStudentCookie, sha256, rateLimit } from "@/lib/auth";

const clean = (s: unknown, max = 80) =>
  typeof s === "string" ? s.replace(/[<>]/g, "").trim().slice(0, max) : "";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (!rateLimit(`join:${ip}`, 20)) {
    return NextResponse.json({ error: "Too many attempts. Wait a moment and try again." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const full_name = clean(body.full_name);
  const student_id = clean(body.student_id, 40);
  const school = clean(body.school, 120);

  if (!full_name) return NextResponse.json({ error: "Enter your full name." }, { status: 400 });
  if (!student_id) return NextResponse.json({ error: "Enter your Student ID." }, { status: 400 });

  const db = supabaseAdmin();
  const token = issueStudentToken();
  const { data: existing } = await db.from("students")
    .select("id, full_name, status").eq("student_id", student_id).maybeSingle();

  let studentUuid: string;
  if (existing) {
    // Returning student reconnects with the same Student ID — one record,
    // token rotates so any older device session is invalidated.
    if (existing.status !== "active") {
      return NextResponse.json({ error: "This Student ID is not active. Please see a facilitator." }, { status: 403 });
    }
    studentUuid = existing.id;
    await db.from("students").update({
      session_token_hash: sha256(token), last_seen_at: new Date().toISOString()
    }).eq("id", studentUuid);
  } else {
    const { data, error } = await db.from("students").insert({
      full_name, student_id, school, session_token_hash: sha256(token)
    }).select("id").single();
    if (error) return NextResponse.json({ error: "Could not register. Check your details and try again." }, { status: 400 });
    studentUuid = data.id;
    // Every student gets a score row immediately (all zeros) so they appear in
    // the ranking / CEO reveal even before answering a single question.
    await db.from("student_scores").upsert(
      { student_id: studentUuid, round_1_score: 0, round_2_score: 0, round_3_score: 0,
        total_score: 0, correct_count: 0, total_response_time_ms: 0 },
      { onConflict: "student_id" }
    );
  }

  const res = NextResponse.json({ ok: true });
  setStudentCookie(res, studentUuid, token);
  return res;
}
