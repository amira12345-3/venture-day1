"use client";
// Buttons are disabled for viewers here, but the SERVER re-checks the role on
// every call — the UI is convenience, /api/admin/* is the boundary.
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProgramState } from "@/lib/types";

export function Controls({ role, state }: { role: string; state: ProgramState }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPhrase, setResetPhrase] = useState("");
  const canRun = role === "facilitator" || role === "super_admin";

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action); setMsg(null);
    const res = await fetch("/api/admin/program", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra })
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) { setMsg(data.error ?? "Action failed."); return; }
    router.refresh();
  }

  const Btn = ({ label, action, extra, tone = "gold", disabled = false }:
    { label: string; action: string; extra?: Record<string, unknown>; tone?: "gold" | "plain" | "danger"; disabled?: boolean }) => (
    <button
      onClick={() => act(action, extra)}
      disabled={!canRun || disabled || busy !== null}
      className={`rounded-xl px-4 py-3 text-sm font-semibold shadow-card disabled:opacity-40 text-left
        ${tone === "gold" ? "brandmark text-white" : tone === "danger" ? "bg-danger text-white" : "bg-surface"}`}>
      {busy === action ? "Working…" : label}
    </button>
  );

  return (
    <section className="bg-surface rounded-card shadow-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Program controls</h2>
        {!canRun && <span className="text-xs text-mute">Viewer role — read only</span>}
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Btn label="Start Round 1 · Founders Qualifier" action="start_round" extra={{ round: 1 }} />
        <Btn label="Start Round 2 · The Contenders" action="start_round" extra={{ round: 2 }} />
        <Btn label="Start Round 3 · Road to CEO" action="start_round" extra={{ round: 3 }} />
        <Btn label="Pause current round" action="pause_round" tone="plain" disabled={state.current_stage !== "round_live"} />
        <Btn label="Resume current round" action="resume_round" tone="plain" disabled={state.current_stage !== "round_paused"} />
        <Btn label="End round & apply elimination cut" action="end_round" tone="plain" disabled={!["round_live", "round_paused"].includes(state.current_stage)} />
        <Btn label={state.leaderboard_visible ? "Hide live leaderboard" : "Open live leaderboard"} action="toggle_leaderboard" tone="plain" />
        <Btn label="Reveal Top 15 CEOs" action="reveal_ceos" />
        <Btn label="Open CEO team draft" action="open_draft" disabled={!state.ceos_revealed} />
        <Btn label="Reveal final teams" action="reveal_teams" disabled={!state.ceos_revealed} />
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <a href="/leaderboard" target="_blank" className="underline text-gold-deep font-medium">Open leaderboard (projector) ↗</a>
        <a href="/api/admin/export?type=scores" className="underline text-gold-deep font-medium">Export scores CSV</a>
        <a href="/api/admin/export?type=students" className="underline text-gold-deep font-medium">Export students CSV</a>
        <a href="/api/admin/export?type=teams" className="underline text-gold-deep font-medium">Export teams CSV</a>
        <a href="/api/admin/export?type=audit" className="underline text-gold-deep font-medium">Export audit log CSV</a>
      </div>

      {role === "super_admin" && (
        <div className="border-t border-sand pt-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            <button onClick={async () => { setBusy("demo"); await fetch("/api/admin/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate" }) }); setBusy(null); router.refresh(); }}
              disabled={busy !== null}
              className="bg-surface border border-mute/30 rounded-xl px-4 py-2 text-sm font-medium">
              Demo Mode: generate 60 demo students
            </button>
            <button onClick={async () => { setBusy("demoClear"); await fetch("/api/admin/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clear" }) }); setBusy(null); router.refresh(); }}
              disabled={busy !== null}
              className="bg-surface border border-mute/30 rounded-xl px-4 py-2 text-sm font-medium">
              Remove demo data only
            </button>
            <button onClick={() => setResetOpen(true)}
              className="bg-danger/10 text-danger border border-danger/30 rounded-xl px-4 py-2 text-sm font-semibold">
              Reset Program…
            </button>
          </div>

          {resetOpen && (
            <div role="alertdialog" aria-labelledby="reset-title" className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4">
              <div className="bg-surface rounded-card shadow-card p-6 max-w-md w-full space-y-4">
                <h3 id="reset-title" className="font-display text-xl font-bold text-danger">Reset the entire program?</h3>
                <p className="text-sm">This permanently deletes <strong>all students, answers, scores, and teams</strong> and returns VENTURE to registration. This cannot be undone.</p>
                <label className="block text-sm font-medium">
                  Type <code className="bg-sand px-1 rounded">RESET VENTURE</code> to confirm:
                  <input value={resetPhrase} onChange={e => setResetPhrase(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-mute/30 px-3 py-2 bg-sand/40" />
                </label>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => { setResetOpen(false); setResetPhrase(""); }}
                    className="rounded-xl px-4 py-2 text-sm font-medium bg-sand">Cancel</button>
                  <button
                    disabled={resetPhrase !== "RESET VENTURE" || busy !== null}
                    onClick={async () => { await act("reset_program", { confirmation: resetPhrase }); setResetOpen(false); setResetPhrase(""); }}
                    className="rounded-xl px-4 py-2 text-sm font-semibold bg-danger text-white disabled:opacity-40">
                    Yes, reset everything
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {msg && <p role="alert" className="text-danger text-sm font-medium">{msg}</p>}
    </section>
  );
}
