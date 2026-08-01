// CSV exports — admin only (viewer role may export read-only views).
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

function csv(headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map(r => r.map(esc).join(","))].join("\n");
}

function file(name: string, body: string) {
  return new NextResponse("\uFEFF" + body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`
    }
  });
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin("viewer");
  if (gate instanceof NextResponse) return gate;
  const db = supabaseAdmin();
  const type = req.nextUrl.searchParams.get("type") ?? "scores";

  if (type === "students") {
    const { data } = await db.from("students")
      .select("full_name, student_id, school, status, is_demo, created_at").order("full_name");
    return file("venture-students.csv", csv(
      ["Full Name", "Student ID", "School", "Status", "Demo", "Registered At"],
      (data ?? []).map(s => [s.full_name, s.student_id, s.school, s.status, s.is_demo ? "yes" : "no", s.created_at])
    ));
  }

  if (type === "scores") {
    const { data } = await db.from("ceo_ranking").select("*").order("rank");
    return file("venture-scores.csv", csv(
      ["Rank", "Full Name", "Student ID", "School", "Round 1", "Round 2", "Round 3", "Total", "Response Time (ms)"],
      (data ?? []).map(r => [r.rank, r.full_name, r.student_code, r.school,
        r.round_1_score, r.round_2_score, r.round_3_score, r.total_score, r.total_response_time_ms])
    ));
  }

  if (type === "answers") {
    const { data } = await db.from("student_answers")
      .select("selected_answer, is_correct, points_awarded, response_time_ms, submitted_at, students(full_name, student_id), questions(legacy_id, question_en)")
      .order("submitted_at");
    return file("venture-answers.csv", csv(
      ["Student", "Student ID", "Question", "Question Text", "Selected", "Correct", "Points", "Response Time (ms)", "Submitted At"],
      (data ?? []).map((a: any) => [a.students?.full_name, a.students?.student_id, a.questions?.legacy_id,
        a.questions?.question_en, a.selected_answer ?? "—", a.is_correct ? "yes" : "no",
        a.points_awarded, a.response_time_ms, a.submitted_at])
    ));
  }

  if (type === "ceos") {
    const { data } = await db.from("ceo_ranking").select("*").lte("rank", 12).order("rank");
    return file("venture-ceos.csv", csv(
      ["Rank", "Full Name", "Student ID", "School", "Total"],
      (data ?? []).map(r => [r.rank, r.full_name, r.student_code, r.school, r.total_score])
    ));
  }

  if (type === "teams") {
    const { data } = await db.from("team_members")
      .select("draft_order, teams(startup_number, pillar), students(full_name, student_id, school)")
      .order("draft_order");
    return file("venture-teams.csv", csv(
      ["Startup #", "Pillar", "Role", "Full Name", "Student ID", "School", "Pick #"],
      (data ?? []).map((m: any) => [m.teams?.startup_number, m.teams?.pillar ?? "—",
        m.draft_order === 0 ? "CEO" : "Member", m.students?.full_name,
        m.students?.student_id, m.students?.school, m.draft_order])
    ));
  }

  if (type === "audit") {
    const { data } = await db.from("audit_logs")
      .select("created_at, action, entity_type, entity_id, reason, admins(full_name, email)")
      .order("created_at", { ascending: false }).limit(2000);
    return file("venture-audit-log.csv", csv(
      ["Time", "Admin", "Email", "Action", "Entity", "Entity ID", "Reason"],
      (data ?? []).map((l: any) => [l.created_at, l.admins?.full_name, l.admins?.email,
        l.action, l.entity_type, l.entity_id, l.reason])
    ));
  }

  if (type === "questions") {
    const { data } = await db.from("questions")
      .select("legacy_id, question_en, question_ar, options, correct_answer, pillar, active, rounds(round_number)")
      .order("display_order");
    return file("venture-question-bank.csv", csv(
      ["Round", "ID", "English", "Arabic", "Option 1", "Option 2", "Option 3", "Option 4", "Correct (0-3)", "Pillar", "Active"],
      (data ?? []).map((q: any) => [q.rounds?.round_number, q.legacy_id, q.question_en, q.question_ar,
        ...(q.options as string[]), q.correct_answer, q.pillar ?? "", q.active ? "yes" : "no"])
    ));
  }

  return NextResponse.json({ error: "Unknown export type." }, { status: 400 });
}
