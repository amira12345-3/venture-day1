"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { POSITION_LABEL } from "@/lib/types";

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  tech: { label: "Suggested: Technical", cls: "bg-gold-pale text-gold-deep" },
  design: { label: "Suggested: Design & Research", cls: "bg-terra/10 text-terra-deep" },
  business: { label: "Suggested: Business & Marketing", cls: "bg-ok/10 text-ok" }
};

export function DraftBoard({ role, state, teams, members, available }:
  { role: string; state: any; teams: any[]; members: any[]; available: any[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [idea, setIdea] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [ai, setAi] = useState<any | null>(null);
  const canRun = role !== "viewer";
  const onClock = state.draft_current_team;

  async function call(payload: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/admin/draft", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setMsg(data.error ?? "Action failed."); return; }
    router.refresh();
  }

  const filtered = available.filter(s =>
    s.full_name.toLowerCase().includes(q.toLowerCase()) || s.student_id.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">Team draft</h1>
        <div className="flex items-center gap-3 text-sm">
          {state.current_stage === "draft" && !state.draft_locked && (
            <span className="bg-gold-pale rounded-full px-4 py-1.5 font-semibold">
              Pick #{state.draft_pick_number} · Startup #{onClock} on the clock
            </span>
          )}
          {state.draft_locked && <span className="bg-ok/15 text-ok rounded-full px-4 py-1.5 font-semibold">Draft locked ✓</span>}
          {canRun && <>
            <button onClick={() => call({ action: "undo_pick" })} disabled={busy || state.draft_locked}
              className="border border-mute/30 rounded-full px-4 py-1.5 bg-surface disabled:opacity-40">Undo last pick</button>
            <button onClick={() => { if (confirm("Lock the final draft? Picks can no longer change.")) call({ action: "lock_draft" }); }}
              disabled={busy || state.draft_locked}
              className="bg-ink text-white rounded-full px-4 py-1.5 disabled:opacity-40">Lock final draft</button>
          </>}
        </div>
      </div>

      {msg && <p role="alert" className="text-danger text-sm font-medium">{msg}</p>}

      <div className="grid lg:grid-cols-[1fr_2fr] gap-5">
        <div className="space-y-5">
        {/* AI Draft Assistant — suggestion only; the CEO decides. */}
        {state.current_stage === "draft" && !state.draft_locked && (
          <section className="bg-surface rounded-card shadow-card p-4 border-2 border-gold/40">
            <h2 className="font-semibold flex items-center gap-2">✨ AI Draft Assistant
              <span className="text-[11px] font-normal text-mute">for Startup #{onClock}</span>
            </h2>
            <p className="text-xs text-mute mt-1 mb-2">CEO: describe your project idea — the assistant suggests who to draft for each open seat, from real answer performance. Suggestion only — you decide.</p>
            <textarea value={idea} onChange={e => setIdea(e.target.value)} rows={3}
              placeholder="e.g. An AI app that helps schools reduce food waste…"
              aria-label="Describe the project idea"
              className="w-full rounded-xl border border-mute/30 px-3 py-2 bg-sand/40 text-sm" />
            <button
              onClick={async () => {
                setAiBusy(true); setAi(null); setMsg(null);
                const res = await fetch("/api/admin/ai-suggest", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ startup_number: onClock, idea })
                });
                const data = await res.json();
                setAiBusy(false);
                if (!res.ok) { setMsg(data.error ?? "Assistant unavailable."); return; }
                setAi(data);
              }}
              disabled={aiBusy || !idea.trim()}
              className="mt-2 w-full brandmark text-white rounded-xl py-2 text-sm font-semibold disabled:opacity-40">
              {aiBusy ? "Thinking…" : "Suggest my team"}
            </button>
            {ai && (
              <div className="mt-3 space-y-2">
                {ai.narrative && <p className="text-xs bg-gold-pale rounded-xl p-2">{ai.narrative}</p>}
                {ai.recommendations.map((r: any) => (
                  <div key={r.seat} className="bg-sand/50 rounded-xl p-2.5 text-sm">
                    <div className="text-[11px] uppercase tracking-wide text-mute">{r.seatLabel}</div>
                    {r.pick ? (<>
                      <div className="font-semibold">{r.pick.name}</div>
                      <div className="text-xs text-mute">{r.pick.reason}</div>
                      {r.alternate && <div className="text-[11px] text-mute mt-1">Alternate: {r.alternate.name} — {r.alternate.reason}</div>}
                    </>) : <div className="text-xs text-mute">No candidates left for this seat.</div>}
                  </div>
                ))}
                <p className="text-[11px] text-mute">To draft a suggested student, use their <strong>Pick</strong> button in the pool below.</p>
              </div>
            )}
          </section>
        )}

        {/* Selection columns — one per role. A CEO picks a name from each
            column; once chosen, that student disappears from EVERY column for
            all CEOs (the shared pool enforces it). */}
        <section className="bg-surface rounded-card shadow-card p-4">
          <h2 className="font-semibold mb-1">Choose the team for Startup #{onClock}</h2>
          <p className="text-xs text-mute mb-3">
            Each student is listed under the role their answers fit best. Pick one name per column — chosen students vanish from every CEO's list. Labels are visible here only, never to students.
          </p>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search all columns…"
            aria-label="Search available students"
            className="w-full rounded-xl border border-mute/30 px-3 py-2 bg-sand/40 mb-3 text-sm" />

          {(() => {
            const onClockTeam = teams.find(t => t.startup_number === onClock);
            const onClockMembers = onClockTeam ? members.filter(m => m.team_id === onClockTeam.id) : [];
            const seatFilled = (role: string) => onClockMembers.some(m => m.position === role);
            const COLS: { role: string; title: string }[] = [
              { role: "tech", title: "AI & Technical Lead" },
              { role: "design", title: "Design & Research Lead" },
              { role: "business", title: "Business & Marketing Lead" }
            ];
            const canPick = canRun && state.current_stage === "draft" && !state.draft_locked;
            return (
              <div className="grid sm:grid-cols-3 gap-3">
                {COLS.map(col => {
                  const candidates = filtered.filter(s => (s.suggested_role ?? "business") === col.role);
                  const filled = seatFilled(col.role);
                  const who = onClockMembers.find(m => m.position === col.role);
                  return (
                    <div key={col.role} className="bg-sand/40 rounded-xl p-2.5">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold">{col.title}</h3>
                        <span className="text-[11px] text-mute">{candidates.length}</span>
                      </div>
                      {filled && (
                        <div className="mb-2 text-xs bg-ok/10 text-ok rounded-lg px-2 py-1">
                          ✓ {who?.students?.full_name} chosen
                        </div>
                      )}
                      <ul className="space-y-2 max-h-[54vh] overflow-y-auto pr-1">
                        {candidates.map(s => (
                          <li key={s.id} className="bg-surface rounded-lg px-2.5 py-2 text-sm shadow-card">
                            <div className="font-medium leading-tight">{s.full_name}</div>
                            <div className="text-[11px] text-mute">{s.school || "—"} · {s.student_scores?.total_score ?? 0} pts</div>
                            {canPick && !filled && (
                              <button onClick={() => call({ action: "pick", student_id: s.id, position: col.role })} disabled={busy}
                                className="mt-1.5 w-full brandmark text-white text-[11px] rounded-full px-2 py-1 font-semibold">
                                Choose → #{onClock}
                              </button>
                            )}
                          </li>
                        ))}
                        {!candidates.length && <li className="text-mute text-xs py-3 text-center">No one left here.</li>}
                      </ul>
                    </div>
                  );
                })}
              </div>
            );
          })()}
          {(state.current_stage !== "draft" || state.draft_locked) && (
            <p className="text-xs text-mute mt-3">Open the draft from the dashboard to start choosing. {available.length} students in the pool.</p>
          )}
        </section>
        </div>

        {/* Teams */}
        <section className="grid sm:grid-cols-2 gap-3 content-start">
          {teams.map(t => {
            const team = members.filter(m => m.team_id === t.id);
            return (
              <div key={t.id} className={`bg-surface rounded-card shadow-card p-4 ${onClock === t.startup_number && state.current_stage === "draft" ? "ring-2 ring-gold" : ""}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-display font-bold">Startup #{t.startup_number}</span>
                </div>
                <ul className="text-sm space-y-1">
                  {team.map(m => (
                    <li key={m.id} className="flex items-center justify-between gap-2">
                      <span>
                        {m.students?.full_name}
                        {m.position === "ceo"
                          ? <span className="text-gold-deep font-semibold"> · CEO ★</span>
                          : <span className="text-mute text-xs"> · {POSITION_LABEL[m.position as keyof typeof POSITION_LABEL] ?? "—"}</span>}
                      </span>
                      {canRun && m.position !== "ceo" && !state.draft_locked && (
                        <span className="flex items-center gap-1 shrink-0">
                          <select aria-label={`Position for ${m.students?.full_name}`} value={m.position ?? ""}
                            onChange={e => call({ action: "set_position", student_id: m.student_id, position: e.target.value })}
                            className="text-[11px] border border-mute/30 rounded-lg px-1 py-0.5 bg-sand/40">
                            <option value="tech">Technical</option>
                            <option value="design">Design & Research</option>
                            <option value="business">Business & Marketing</option>
                          </select>
                          <button title="Move to another team" aria-label={`Move ${m.students?.full_name} to another team`}
                            onClick={() => {
                              const to = Number(prompt("Move to which startup number (1–15)?"));
                              const reason = prompt("Reason:") ?? undefined;
                              if (to >= 1 && to <= 15) call({ action: "move_student", student_id: m.student_id, to_startup_number: to, reason });
                            }}
                            className="text-xs text-mute hover:text-ink">⇄</button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-mute mt-2">{team.length} / 4 members · CEO + 3 leads</p>
              </div>
            );
          })}
          {!teams.length && <p className="text-mute">No teams yet — reveal the Top 15 CEOs from the dashboard first.</p>}
        </section>
      </div>

      {canRun && teams.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <a href="/api/admin/export?type=teams" className="text-sm underline text-gold-deep font-medium self-center">Export teams CSV</a>
        </div>
      )}
    </div>
  );
}
