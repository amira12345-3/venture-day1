// Program controls. Every action: role-checked, audit-logged, executed
// server-side. Students update live via Realtime on program_state.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { CEO_COUNT, KEEP_AFTER_ROUND } from "@/lib/types";

// Compute each student's privately-suggested position from their answers:
// per role tag → correct count, tie-broken by faster average response time.
// Stored on students.suggested_role; shown ONLY on the admin draft board.
async function computeSuggestedRoles(db: ReturnType<typeof supabaseAdmin>) {
  const { data: answers } = await db.from("student_answers")
    .select("student_id, is_correct, response_time_ms, questions(role_focus)");
  const per: Record<string, Record<string, { c: number; t: number; n: number }>> = {};
  for (const a of answers ?? []) {
    const role = (a.questions as any)?.role_focus;
    if (!role) continue;
    const row = (per[a.student_id] ??= {});
    const cell = (row[role] ??= { c: 0, t: 0, n: 0 });
    if (a.is_correct) cell.c += 1;
    cell.t += a.response_time_ms ?? 0;
    cell.n += 1;
  }
  const ORDER = ["tech", "design", "business"];
  // Parallel updates — sequential round trips were the reveal's bottleneck.
  await Promise.all(Object.entries(per).map(([studentId, roles]) => {
    const best = ORDER
      .map(r => ({ r, c: roles[r]?.c ?? 0, avg: roles[r]?.n ? roles[r].t / roles[r].n : Infinity }))
      .sort((a, b) => b.c - a.c || a.avg - b.avg)[0];
    return db.from("students").update({ suggested_role: best.r }).eq("id", studentId);
  }));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action: string = body.action;

  // Reset is the most destructive action → super admin + typed phrase.
  const minRole = action === "reset_program" ? "super_admin" : "facilitator";
  const gate = await requireAdmin(minRole);
  if (gate instanceof NextResponse) return gate;
  const admin = gate;
  const db = supabaseAdmin();

  const { data: prev } = await db.from("program_state").select("*").eq("id", 1).single();
  const touch = { updated_at: new Date().toISOString() };

  switch (action) {
    case "start_round": {
      const n = Number(body.round);
      if (![1, 2, 3].includes(n)) return NextResponse.json({ error: "Round must be 1, 2, or 3." }, { status: 400 });
      await db.from("rounds").update({ status: "live", started_at: new Date().toISOString() }).eq("round_number", n);
      await db.from("program_state").update({ current_stage: "round_live", current_round: n, ...touch }).eq("id", 1);
      break;
    }
    case "pause_round": {
      await db.from("rounds").update({ status: "paused" }).eq("round_number", prev!.current_round);
      await db.from("program_state").update({ current_stage: "round_paused", ...touch }).eq("id", 1);
      break;
    }
    case "resume_round": {
      // Re-serve the current question fresh so paused time never counts against students.
      const { data: round } = await db.from("rounds").select("id").eq("round_number", prev!.current_round).single();
      await db.from("student_progress")
        .update({ question_served_at: new Date().toISOString() })
        .eq("round_id", round!.id).eq("completed", false);
      await db.from("rounds").update({ status: "live" }).eq("round_number", prev!.current_round);
      await db.from("program_state").update({ current_stage: "round_live", ...touch }).eq("id", 1);
      break;
    }
    case "end_round": {
      const n = prev!.current_round!;
      await db.from("rounds").update({ status: "ended", ended_at: new Date().toISOString() }).eq("round_number", n);

      // Elimination cut: keep the top N still-in-race students (45 → 30 → 15),
      // using the full tie-breaker ordering from ceo_ranking. Students below
      // the line leave the CEO race but stay in the event and the draft pool.
      const keep = KEEP_AFTER_ROUND[n];
      if (keep) {
        const { data: ranked } = await db.from("ceo_ranking")
          .select("student_id, rank").is("eliminated_after_round", null).order("rank");
        const inRace = ranked ?? [];
        const cut = inRace.slice(keep).map(r => r.student_id);
        if (cut.length) {
          await db.from("students").update({ eliminated_after_round: n }).in("id", cut);
        }
        await audit({ admin_id: admin.id, action: `program.elimination_cut`, entity_type: "round",
          entity_id: String(n), new_value: { kept: Math.min(keep, inRace.length), eliminated: cut.length } });
      }

      await db.from("program_state").update({ current_stage: "between_rounds", ...touch }).eq("id", 1);
      break;
    }
    case "toggle_leaderboard": {
      await db.from("program_state").update({ leaderboard_visible: !prev!.leaderboard_visible, ...touch }).eq("id", 1);
      break;
    }
    case "reveal_ceos": {
      // Safety net: guarantee every active student has a score row, so nobody
      // is invisible to the ranking just because they haven't answered yet.
      const { data: allActive } = await db.from("students").select("id").eq("status", "active");
      if (allActive?.length) {
        await db.from("student_scores").upsert(
          allActive.map(s => ({ student_id: s.id })),
          { onConflict: "student_id", ignoreDuplicates: true }
        );
      }

      // Top 15 of the students STILL IN THE RACE become CEOs (rank order).
      const { data: ranked } = await db.from("ceo_ranking")
        .select("*").is("eliminated_after_round", null).order("rank");
      const top = (ranked ?? []).slice(0, CEO_COUNT);
      if (top.length < CEO_COUNT) {
        return NextResponse.json({ error: `Only ${top.length} student(s) are in the CEO race — ${CEO_COUNT} are needed. Register more students, or use Demo Mode to generate 60 for a rehearsal.` }, { status: 409 });
      }

      // Freeze the private position suggestions for the whole draft pool.
      await computeSuggestedRoles(db);
      await db.from("team_members").delete().neq("draft_order", -999);
      await db.from("teams").delete().neq("startup_number", -1);
      // Bulk-create all 15 startups + CEO seats in two queries (was ~30).
      const { data: newTeams } = await db.from("teams").insert(
        top.map((ceo, i) => ({ startup_number: i + 1, ceo_student_id: ceo.student_id }))
      ).select("id, startup_number, ceo_student_id");
      await db.from("team_members").insert(
        (newTeams ?? []).map(t => ({ team_id: t.id, student_id: t.ceo_student_id, draft_order: 0, position: "ceo" }))
      );
      await db.from("program_state").update({
        current_stage: "ceo_reveal", ceos_revealed: true, draft_pick_number: 0, draft_current_team: null, ...touch
      }).eq("id", 1);
      break;
    }
    case "open_draft": {
      if (!prev!.ceos_revealed) return NextResponse.json({ error: "Reveal CEOs before opening the draft." }, { status: 409 });
      await db.from("program_state").update({
        current_stage: "draft", draft_pick_number: 1, draft_current_team: 1, ...touch
      }).eq("id", 1);
      break;
    }
    case "reveal_teams": {
      await db.from("program_state").update({ current_stage: "teams_final", teams_revealed: true, ...touch }).eq("id", 1);
      break;
    }
    case "reset_program": {
      if (body.confirmation !== "RESET VENTURE") {
        return NextResponse.json({ error: 'Type the exact phrase "RESET VENTURE" to confirm.' }, { status: 400 });
      }
      await db.from("student_answers").delete().neq("points_awarded", -1);
      await db.from("student_progress").delete().neq("current_index", -1);
      await db.from("student_scores").delete().neq("total_score", -1);
      await db.from("team_members").delete().neq("draft_order", -999);
      await db.from("teams").delete().neq("startup_number", -1);
      await db.from("students").delete().neq("status", "__never__" as never);
      await db.from("rounds").update({ status: "pending", started_at: null, ended_at: null }).neq("round_number", -1);
      await db.from("program_state").update({
        current_stage: "registration", current_round: null, leaderboard_visible: false,
        ceos_revealed: false, draft_locked: false, teams_revealed: false,
        draft_pick_number: 0, draft_current_team: null, ...touch
      }).eq("id", 1);
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const { data: next } = await db.from("program_state").select("*").eq("id", 1).single();
  await audit({
    admin_id: admin.id, action: `program.${action}`, entity_type: "program_state", entity_id: "1",
    previous_value: prev, new_value: next, reason: body.reason
  });
  return NextResponse.json({ ok: true, state: next });
}
