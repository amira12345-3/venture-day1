import { currentAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Controls } from "./controls";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const admin = (await currentAdmin())!;
  const db = supabaseAdmin();

  const [{ data: state }, { count: registered }, { data: scores }, { data: rounds }, { data: recent }] =
    await Promise.all([
      db.from("program_state").select("*").eq("id", 1).single(),
      db.from("students").select("id", { count: "exact", head: true }).eq("status", "active"),
      db.from("student_scores").select("total_score"),
      db.from("rounds").select("*").order("round_number"),
      db.from("students").select("full_name, school, last_seen_at").order("last_seen_at", { ascending: false }).limit(8)
    ]);

  // Completion per round
  const completion: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  for (const r of rounds ?? []) {
    const { count } = await db.from("student_progress")
      .select("id", { count: "exact", head: true }).eq("round_id", r.id).eq("completed", true);
    completion[r.round_number] = count ?? 0;
  }

  const { count: inRace } = await db.from("students")
    .select("id", { count: "exact", head: true }).eq("status", "active").is("eliminated_after_round", null);

  const activeCutoff = new Date(Date.now() - 5 * 60_000).toISOString();
  const { count: activeNow } = await db.from("students")
    .select("id", { count: "exact", head: true }).eq("status", "active").gte("last_seen_at", activeCutoff);

  const totals = (scores ?? []).map(s => s.total_score);
  const avg = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;
  const high = totals.length ? Math.max(...totals) : 0;

  const stageLabel: Record<string, string> = {
    registration: "Registration open", round_live: `Round ${state!.current_round} live`,
    round_paused: `Round ${state!.current_round} paused`, between_rounds: "Between rounds",
    ceo_reveal: "CEOs revealed", draft: "Draft in progress", teams_final: "Teams final"
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">Dashboard</h1>
        <span className="bg-gold-pale rounded-full px-4 py-1.5 text-sm font-semibold">
          {stageLabel[state!.current_stage] ?? state!.current_stage}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Registered students" value={registered ?? 0} />
        <Card label="Active in last 5 min" value={activeNow ?? 0} />
        <Card label="Average score" value={avg} />
        <Card label="Highest score" value={high} />
        <Card label="Completed Round 1" value={completion[1]} />
        <Card label="Completed Round 2" value={completion[2]} />
        <Card label="Completed Round 3" value={completion[3]} />
        <Card label="Still in CEO race" value={inRace ?? 0} />
        <Card label="Top 15 CEOs" value={state!.ceos_revealed ? "Revealed" : "Pending"} />
      </div>

      <Controls role={admin.role} state={state!} />

      <section className="bg-surface rounded-card shadow-card p-5">
        <h2 className="font-semibold mb-3">Recent student activity</h2>
        <ul className="text-sm divide-y divide-sand">
          {(recent ?? []).map((r, i) => (
            <li key={i} className="py-2 flex justify-between">
              <span>{r.full_name} <span className="text-mute">· {r.school || "—"}</span></span>
              <span className="text-mute">{new Date(r.last_seen_at).toLocaleTimeString()}</span>
            </li>
          ))}
          {!recent?.length && <li className="py-4 text-mute">No students yet — the room fills up fast once doors open.</li>}
        </ul>
      </section>
    </div>
  );
}

function Card({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-card shadow-card p-4">
      <div className="font-display text-3xl font-bold">{value}</div>
      <div className="text-xs text-mute mt-1">{label}</div>
    </div>
  );
}
