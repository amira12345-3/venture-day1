// Student management: edit, score correction (reason required), disqualify /
// reactivate, per-round or full reset, duplicate removal. All audit-logged.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const gate = await requireAdmin("facilitator");
  if (gate instanceof NextResponse) return gate;
  const admin = gate;
  const db = supabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const { action, student_id, reason } = body;

  const need = (v: unknown, msg: string) =>
    v ? null : NextResponse.json({ error: msg }, { status: 400 });

  switch (action) {
    case "edit": {
      const bad = need(student_id, "student_id required"); if (bad) return bad;
      const { data: before } = await db.from("students").select("full_name, school, student_id").eq("id", student_id).single();
      const patch: Record<string, string> = {};
      for (const k of ["full_name", "school"] as const) {
        if (typeof body[k] === "string" && body[k].trim()) patch[k] = body[k].replace(/[<>]/g, "").trim();
      }
      if (typeof body.new_student_id === "string" && body.new_student_id.trim()) {
        patch.student_id = body.new_student_id.replace(/[<>]/g, "").trim();
      }
      const { error } = await db.from("students").update(patch).eq("id", student_id);
      if (error) return NextResponse.json({ error: "Update failed — is that Student ID already taken?" }, { status: 409 });
      await audit({ admin_id: admin.id, action: "student.edit", entity_type: "student", entity_id: student_id,
        previous_value: before, new_value: patch, reason });
      break;
    }
    case "correct_score": {
      // A required reason + audit entry for every manual score change.
      const bad = need(reason, "A reason is required for every score correction."); if (bad) return bad;
      const { round, new_score } = body;
      if (![1, 2, 3].includes(round) || !Number.isInteger(new_score) || new_score < 0 || new_score > 200) {
        return NextResponse.json({ error: "Provide round (1–3) and a score between 0 and 200." }, { status: 400 });
      }
      const col = `round_${round}_score`;
      const { data: before } = await db.from("student_scores").select("*").eq("student_id", student_id).single();
      const patch: Record<string, number> = { [col]: new_score };
      const total = [1, 2, 3].reduce((sum, r) =>
        sum + (r === round ? new_score : (before as any)[`round_${r}_score`]), 0);
      await db.from("student_scores").update({ ...patch, total_score: total, updated_at: new Date().toISOString() })
        .eq("student_id", student_id);
      await audit({ admin_id: admin.id, action: "student.correct_score", entity_type: "student",
        entity_id: student_id, previous_value: before, new_value: patch, reason });
      break;
    }
    case "disqualify":
    case "reactivate": {
      const status = action === "disqualify" ? "disqualified" : "active";
      const { data: before } = await db.from("students").select("status").eq("id", student_id).single();
      await db.from("students").update({ status }).eq("id", student_id);
      await audit({ admin_id: admin.id, action: `student.${action}`, entity_type: "student",
        entity_id: student_id, previous_value: before, new_value: { status }, reason });
      break;
    }
    case "reset_round": {
      const { round } = body;
      const { data: r } = await db.from("rounds").select("id").eq("round_number", round).single();
      const { data: qids } = await db.from("questions").select("id").eq("round_id", r!.id);
      await db.from("student_answers").delete().eq("student_id", student_id)
        .in("question_id", (qids ?? []).map(q => q.id));
      await db.from("student_progress").delete().eq("student_id", student_id).eq("round_id", r!.id);
      await db.rpc("recompute_score", { p_student: student_id });
      await audit({ admin_id: admin.id, action: "student.reset_round", entity_type: "student",
        entity_id: student_id, new_value: { round }, reason });
      break;
    }
    case "reset_all": {
      await db.from("student_answers").delete().eq("student_id", student_id);
      await db.from("student_progress").delete().eq("student_id", student_id);
      await db.from("student_scores").delete().eq("student_id", student_id);
      await audit({ admin_id: admin.id, action: "student.reset_all", entity_type: "student",
        entity_id: student_id, reason });
      break;
    }
    case "delete_duplicate": {
      const { data: before } = await db.from("students").select("*").eq("id", student_id).single();
      await db.from("students").delete().eq("id", student_id);
      await audit({ admin_id: admin.id, action: "student.delete_duplicate", entity_type: "student",
        entity_id: student_id, previous_value: before, reason });
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
