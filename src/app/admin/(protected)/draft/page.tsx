import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentAdmin } from "@/lib/auth";
import { DraftBoard } from "./board";

export const dynamic = "force-dynamic";

export default async function DraftPage() {
  const admin = (await currentAdmin())!;
  const db = supabaseAdmin();

  const [{ data: state }, { data: teams }, { data: members }, { data: pool }] = await Promise.all([
    db.from("program_state").select("*").eq("id", 1).single(),
    db.from("teams").select("id, startup_number, locked, students!teams_ceo_student_id_fkey(full_name, school)").order("startup_number"),
    db.from("team_members").select("id, team_id, student_id, draft_order, position, students(full_name, school, student_id)").order("draft_order"),
    db.from("students").select("id, full_name, school, student_id, suggested_role, student_scores(total_score)").eq("status", "active").order("full_name")
  ]);

  const drafted = new Set((members ?? []).map(m => m.student_id));
  const available = (pool ?? []).filter(s => !drafted.has(s.id));

  return (
    <DraftBoard
      role={admin.role}
      state={state!}
      teams={teams ?? []}
      members={members ?? []}
      available={available}
    />
  );
}
