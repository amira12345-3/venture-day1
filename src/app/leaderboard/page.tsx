"use client";
// Projector leaderboard. Reads only the RLS-gated leaderboard_public view —
// when the admin turns visibility off, the database returns nothing, no
// matter what a browser tries. Auto-refreshes on Realtime + a short poll.
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Brand } from "@/components/Brand";

export default function Leaderboard() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [visible, setVisible] = useState<boolean | null>(null);
  const [ceosRevealed, setCeosRevealed] = useState(false);
  const [hideIds, setHideIds] = useState(false);
  const [school, setSchool] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const supa = supabaseBrowser();
    const [{ data: state }, { data }] = await Promise.all([
      supa.from("program_state").select("leaderboard_visible, ceos_revealed").eq("id", 1).single(),
      supa.from("leaderboard_public").select("*").order("total_score", { ascending: false })
    ]);
    setVisible(state?.leaderboard_visible ?? false);
    setCeosRevealed(state?.ceos_revealed ?? false);
    setRows(data ?? []);
  }, []);

  useEffect(() => {
    load();
    const supa = supabaseBrowser();
    const ch = supa.channel("lb")
      .on("postgres_changes", { event: "*", schema: "public", table: "program_state" }, load)
      .subscribe();
    const t = setInterval(load, 4000);
    return () => { supa.removeChannel(ch); clearInterval(t); };
  }, [load]);

  const schools = [...new Set((rows ?? []).map(r => r.school).filter(Boolean))].sort();
  const filtered = (rows ?? [])
    .filter(r => !school || r.school === school)
    .filter(r => !q || r.full_name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="min-h-screen px-4 sm:px-8 py-6">
      <header className="no-print flex flex-wrap items-center justify-between gap-3 mb-6">
        <Brand sub="Live leaderboard" />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name…"
            aria-label="Search by student name"
            className="rounded-xl border border-mute/30 px-3 py-1.5 bg-surface" />
          <select value={school} onChange={e => setSchool(e.target.value)} aria-label="Filter by school"
            className="rounded-xl border border-mute/30 px-3 py-1.5 bg-surface">
            <option value="">All schools</option>
            {schools.map(s => <option key={s}>{s}</option>)}
          </select>
          <button onClick={() => setHideIds(v => !v)} className="border border-mute/30 rounded-xl px-3 py-1.5 bg-surface">
            {hideIds ? "Show Student IDs" : "Hide Student IDs"}
          </button>
          <button onClick={load} className="border border-mute/30 rounded-xl px-3 py-1.5 bg-surface">Refresh</button>
          <button onClick={() => document.documentElement.requestFullscreen?.()}
            className="brandmark text-white rounded-xl px-3 py-1.5 font-semibold">Full screen</button>
        </div>
      </header>

      {visible === false && (
        <div className="grid place-items-center py-32 text-center">
          <div>
            <h1 className="font-display text-4xl font-bold">Leaderboard is hidden</h1>
            <p className="text-mute mt-2">A facilitator can open it from the admin dashboard.</p>
          </div>
        </div>
      )}

      {visible && (
        <div className="bg-surface rounded-card shadow-card overflow-x-auto">
          <table className="w-full text-sm sm:text-base">
            <thead className="text-left text-xs uppercase tracking-wide text-mute border-b border-sand">
              <tr>
                <th className="p-3">Rank</th><th className="p-3">Founder</th>
                {!hideIds && <th className="p-3">Student ID</th>}
                <th className="p-3">School</th>
                <th className="p-3 text-right">R1</th><th className="p-3 text-right">R2</th>
                <th className="p-3 text-right">R3</th><th className="p-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand">
              {filtered.map((r, i) => (
                <tr key={i} className={`${ceosRevealed && i < 15 && !r.eliminated_after_round ? "bg-gold-pale/60" : ""} ${r.eliminated_after_round ? "opacity-45" : ""}`}>
                  <td className="p-3 font-display font-bold">
                    {i + 1}
                    {ceosRevealed && i < 15 && !r.eliminated_after_round && <span title="CEO" className="ml-1">★</span>}
                    {r.eliminated_after_round && <span title={`Out after Round ${r.eliminated_after_round}`} className="ml-1 text-xs font-sans text-mute">R{r.eliminated_after_round}</span>}
                  </td>
                  <td className="p-3 font-medium">{r.full_name}</td>
                  {!hideIds && <td className="p-3 text-mute">{r.student_id}</td>}
                  <td className="p-3 text-mute">{r.school || "—"}</td>
                  <td className="p-3 text-right tabular-nums">{r.round_1_score}</td>
                  <td className="p-3 text-right tabular-nums">{r.round_2_score}</td>
                  <td className="p-3 text-right tabular-nums">{r.round_3_score}</td>
                  <td className="p-3 text-right font-bold tabular-nums">{r.total_score}</td>
                </tr>
              ))}
              {rows !== null && !filtered.length && (
                <tr><td colSpan={8} className="p-8 text-center text-mute">Scores appear here the moment answers start landing.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
