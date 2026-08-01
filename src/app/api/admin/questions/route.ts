// Question bank management — Super Admin only (content controls the game).
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const gate = await requireAdmin("super_admin");
  if (gate instanceof NextResponse) return gate;
  const admin = gate;
  const db = supabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const { action } = body;

  switch (action) {
    case "upsert": {
      const q = body.question;
      if (!q?.question_en || !Array.isArray(q.options) || q.options.length !== 4 ||
          !Number.isInteger(q.correct_answer) || q.correct_answer < 0 || q.correct_answer > 3) {
        return NextResponse.json({ error: "A question needs English text, 4 options, and a correct answer (0–3)." }, { status: 400 });
      }
      const row = {
        id: q.id || undefined,
        round_id: q.round_id,
        question_en: q.question_en, question_ar: q.question_ar ?? "",
        options: q.options, correct_answer: q.correct_answer,
        pillar: q.pillar ?? null, display_order: q.display_order ?? 0,
        active: q.active ?? true
      };
      const { data, error } = await db.from("questions").upsert(row).select("id").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await audit({ admin_id: admin.id, action: "question.upsert", entity_type: "question", entity_id: data.id, new_value: row });
      break;
    }
    case "delete": {
      const { data: before } = await db.from("questions").select("*").eq("id", body.id).single();
      await db.from("questions").delete().eq("id", body.id);
      await audit({ admin_id: admin.id, action: "question.delete", entity_type: "question", entity_id: body.id, previous_value: before });
      break;
    }
    case "toggle_active": {
      await db.from("questions").update({ active: body.active }).eq("id", body.id);
      await audit({ admin_id: admin.id, action: "question.toggle", entity_type: "question", entity_id: body.id, new_value: { active: body.active } });
      break;
    }
    case "update_round": {
      const patch: Record<string, number> = {};
      if (Number.isInteger(body.time_per_question)) patch.time_per_question = body.time_per_question;
      if (Number.isInteger(body.points_per_question)) patch.points_per_question = body.points_per_question;
      await db.from("rounds").update(patch).eq("round_number", body.round_number);
      await audit({ admin_id: admin.id, action: "round.update", entity_type: "round", entity_id: String(body.round_number), new_value: patch });
      break;
    }
    case "import_csv": {
      // rows: [{round_number, question_en, question_ar, opt1..opt4, correct_answer, pillar}]
      const rows = body.rows;
      if (!Array.isArray(rows)) return NextResponse.json({ error: "rows must be an array." }, { status: 400 });
      const { data: rounds } = await db.from("rounds").select("id, round_number");
      const byN = Object.fromEntries((rounds ?? []).map(r => [r.round_number, r.id]));
      const inserts = rows.map((r: any, i: number) => ({
        round_id: byN[Number(r.round_number)],
        question_en: String(r.question_en ?? ""), question_ar: String(r.question_ar ?? ""),
        options: [r.opt1, r.opt2, r.opt3, r.opt4].map(String),
        correct_answer: Number(r.correct_answer), pillar: r.pillar || null,
        display_order: 1000 + i, active: true
      })).filter(r => r.round_id && r.question_en);
      const { error } = await db.from("questions").insert(inserts);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await audit({ admin_id: admin.id, action: "question.import_csv", new_value: { count: inserts.length } });
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
