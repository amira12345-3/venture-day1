// Snake draft: 15 teams, order 1→15 then 15→1, reversing each round.
// Each pick auto-assigns the student's privately-suggested position if that
// seat is free on the team, otherwise the best still-open seat.
// The server derives whose turn it is from draft_pick_number, so the
// browser can never fake the order or double-pick a student.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { teamForPick } from "@/lib/draft";

export async function POST(req: NextRequest) {
  const gate = await requireAdmin("facilitator");
  if (gate instanceof NextResponse) return gate;
  const admin = gate;
  const db = supabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const action: string = body.action;

  const { data: state } = await db.from("program_state").select("*").eq("id", 1).single();
  if (state!.draft_locked && action !== "unlock_draft") {
    return NextResponse.json({ error: "The draft is locked." }, { status: 409 });
  }

  switch (action) {
    case "pick": {
      if (state!.current_stage !== "draft") return NextResponse.json({ error: "Open the draft first." }, { status: 409 });
      const studentId: string = body.student_id;
      const onClock = teamForPick(state!.draft_pick_number);
      const { data: team } = await db.from("teams").select("id").eq("startup_number", onClock).single();

      // Team of 4 = CEO + 3 leads; a full team can't pick again.
      const { data: existing } = await db.from("team_members").select("position").eq("team_id", team!.id);
      if ((existing ?? []).length >= 4) {
        return NextResponse.json({ error: `Startup #${onClock} is already full (4 members).` }, { status: 409 });
      }

      // Seat assignment. If the CEO picked from a specific role column, honour
      // that seat when it's open; otherwise fall back to the student's
      // suggested position, then the best remaining open seat.
      const taken = new Set((existing ?? []).map(m => m.position));
      const requested: string | undefined = body.position;
      let position: string;
      if (requested && ["tech", "design", "business"].includes(requested) && !taken.has(requested)) {
        position = requested;
      } else {
        const { data: stu } = await db.from("students").select("suggested_role").eq("id", studentId).single();
        const preference = [stu?.suggested_role, "tech", "design", "business"].filter(Boolean) as string[];
        position = preference.find(r => r !== "ceo" && !taken.has(r)) ?? "business";
      }

      // unique(student_id) on team_members makes duplicate picks impossible.
      const { error } = await db.from("team_members").insert({
        team_id: team!.id, student_id: studentId, draft_order: state!.draft_pick_number, position
      });
      if (error) return NextResponse.json({ error: "That student is already on a team." }, { status: 409 });

      const nextPick = state!.draft_pick_number + 1;
      await db.from("program_state").update({
        draft_pick_number: nextPick, draft_current_team: teamForPick(nextPick), updated_at: new Date().toISOString()
      }).eq("id", 1);
      await audit({ admin_id: admin.id, action: "draft.pick", entity_type: "student", entity_id: studentId,
        new_value: { pick: state!.draft_pick_number, startup_number: onClock, position } });
      break;
    }
    case "undo_pick": {
      const lastPick = state!.draft_pick_number - 1;
      if (lastPick < 1) return NextResponse.json({ error: "Nothing to undo." }, { status: 409 });
      const { data: removed } = await db.from("team_members")
        .delete().eq("draft_order", lastPick).select("student_id").maybeSingle();
      await db.from("program_state").update({
        draft_pick_number: lastPick, draft_current_team: teamForPick(lastPick), updated_at: new Date().toISOString()
      }).eq("id", 1);
      await audit({ admin_id: admin.id, action: "draft.undo", entity_type: "student",
        entity_id: removed?.student_id, previous_value: { pick: lastPick } });
      break;
    }
    case "move_student": {
      const { student_id, to_startup_number, reason } = body;
      const { data: to } = await db.from("teams").select("id").eq("startup_number", to_startup_number).single();
      const { count } = await db.from("team_members").select("id", { count: "exact", head: true }).eq("team_id", to!.id);
      if ((count ?? 0) >= 4) {
        return NextResponse.json({ error: `Startup #${to_startup_number} is already full (4 members).` }, { status: 409 });
      }
      const { data: before } = await db.from("team_members").select("team_id").eq("student_id", student_id).maybeSingle();
      await db.from("team_members").update({ team_id: to!.id }).eq("student_id", student_id);
      await audit({ admin_id: admin.id, action: "draft.move_student", entity_type: "student", entity_id: student_id,
        previous_value: before, new_value: { team_id: to!.id }, reason });
      break;
    }
    case "set_position": {
      const { student_id, position } = body;
      if (!["tech", "design", "business"].includes(position)) {
        return NextResponse.json({ error: "Unknown position." }, { status: 400 });
      }
      const { data: before } = await db.from("team_members").select("position").eq("student_id", student_id).maybeSingle();
      await db.from("team_members").update({ position }).eq("student_id", student_id).neq("position", "ceo");
      await audit({ admin_id: admin.id, action: "draft.set_position", entity_type: "student",
        entity_id: student_id, previous_value: before, new_value: { position } });
      break;
    }
    case "lock_draft": {
      await db.from("program_state").update({ draft_locked: true, updated_at: new Date().toISOString() }).eq("id", 1);
      await audit({ admin_id: admin.id, action: "draft.lock" });
      break;
    }
    case "unlock_draft": {
      await db.from("program_state").update({ draft_locked: false, updated_at: new Date().toISOString() }).eq("id", 1);
      await audit({ admin_id: admin.id, action: "draft.unlock" });
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
