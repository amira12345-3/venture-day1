"use client";
// The entire student journey lives here, driven by /api/student/state.
// Realtime on program_state (the only table students can read) triggers a
// refetch; a slow poll covers dropped connections. Questions arrive one at a
// time from the server WITHOUT correct answers, and timing is server-stamped —
// refreshing the page resumes exactly where the student left off.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { POSITION_LABEL } from "@/lib/types";
import { Brand } from "@/components/Brand";

type StateResponse = any;

export default function Play() {
  const router = useRouter();
  const [s, setS] = useState<StateResponse | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [offline, setOffline] = useState(false);
  const qidRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/student/state", { cache: "no-store" });
      if (res.status === 401) { router.replace("/"); return; }
      const data = await res.json();
      setOffline(false);
      setS(data);
      const qid = data?.roundView?.question?.id ?? null;
      if (qid !== qidRef.current) {
        qidRef.current = qid;
        setSelected(null);
        setSeconds(data?.roundView?.secondsRemaining ?? 0);
      } else if (data?.roundView && !data.roundView.done) {
        setSeconds(data.roundView.secondsRemaining);
      }
    } catch {
      setOffline(true); // reconnect handled by the poll below
    }
  }, [router]);

  useEffect(() => {
    refresh();
    const supa = supabaseBrowser();
    const channel = supa
      .channel("program")
      .on("postgres_changes", { event: "*", schema: "public", table: "program_state" }, () => refresh())
      .subscribe();
    const poll = setInterval(refresh, 8000);
    const online = () => refresh();
    window.addEventListener("online", online);
    return () => { supa.removeChannel(channel); clearInterval(poll); window.removeEventListener("online", online); };
  }, [refresh]);

  // Countdown — display only; the server clock decides the real deadline.
  const live = s?.roundView && !s.roundView.done && !s.roundView.paused;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setSeconds(v => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [live, qidRef.current]);

  const submit = useCallback(async (auto = false) => {
    if (!s?.roundView?.question || submitting) return;
    if (!auto && selected === null) return;
    setSubmitting(true);
    try {
      await fetch("/api/student/answer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: s.roundView.question.id, selected_answer: auto ? selected : selected })
      });
    } finally {
      setSubmitting(false);
      refresh();
    }
  }, [s, selected, submitting, refresh]);

  // Auto-submit when the timer hits zero (unanswered if nothing selected).
  useEffect(() => {
    if (live && seconds === 0 && s?.roundView?.question) submit(true);
  }, [seconds, live]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) return <Shell><p className="text-mute text-center py-20">Loading your seat…</p></Shell>;

  const stage = s.stage as string;

  return (
    <Shell name={s.student?.name}>
      {offline && (
        <div role="status" className="bg-terra/10 text-terra-deep text-sm rounded-xl px-4 py-2 mb-4 text-center">
          Connection lost — reconnecting automatically. Your progress is saved on the server.
        </div>
      )}

      {stage === "registration" && <WaitingRoom s={s} />}
      {s.eliminatedView && <EliminatedRoom s={s} />}
      {!s.eliminatedView && (stage === "round_live" || stage === "round_paused") && (
        s.roundView?.done
          ? <RoundDone s={s} />
          : <Quiz s={s} seconds={seconds} selected={selected} setSelected={setSelected} submit={() => submit(false)} submitting={submitting} />
      )}
      {!s.eliminatedView && stage === "between_rounds" && <RoundDone s={s} between />}
      {stage === "ceo_reveal" && <CeoReveal s={s} />}
      {stage === "draft" && <DraftView s={s} />}
      {stage === "teams_final" && <FinalTeams s={s} />}
    </Shell>
  );
}

function Shell({ children, name }: { children: React.ReactNode; name?: string }) {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-4 sm:px-6 py-4">
        <Brand />
        <div className="flex items-center gap-3">
          {name && <span className="text-sm bg-surface rounded-full px-4 py-1.5 shadow-card font-medium">{name}</span>}
          <a href="/admin/login" className="text-xs text-mute hover:text-ink">Admin Login</a>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 pb-16">{children}</main>
    </div>
  );
}

function WaitingRoom({ s }: { s: any }) {
  return (
    <div className="space-y-5 rise">
      <div className="bg-surface rounded-card shadow-card p-6 text-center">
        <p className="text-ok font-semibold text-sm uppercase tracking-widest">✓ Checked in</p>
        <h1 className="font-display text-3xl font-bold mt-2">{s.student.name}</h1>
        <p className="text-mute mt-1">{s.student.school || "—"} · ID {s.student.student_id}</p>
        <p className="mt-4 text-lg"><span className="font-display text-3xl gold-text font-bold">{s.registered}</span> founders in the room</p>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        {[
          { n: 1, t: "Founders Qualifier" },
          { n: 2, t: "The Contenders" },
          { n: 3, t: "Road to CEO" }
        ].map(r => (
          <div key={r.n} className="bg-surface rounded-card shadow-card p-4 text-center">
            <div className="text-xs uppercase tracking-widest text-mute">Round {r.n}</div>
            <div className="font-semibold mt-1">{r.t}</div>
          </div>
        ))}
      </div>
      <div className="bg-gold-pale rounded-card p-5 text-center">
        <p className="font-medium">Your facilitator will start the round from the stage — this screen updates by itself.</p>
        <p className="ar mt-1" dir="rtl" lang="ar">سيبدأ المُيسِّر الجولة من المسرح — هذه الشاشة تتحدّث تلقائياً.</p>
        <p className="text-sm text-mute mt-2">30 seconds per question · eyes on your own screen!</p>
      </div>
    </div>
  );
}

function Quiz({ s, seconds, selected, setSelected, submit, submitting }: any) {
  const rv = s.roundView;
  const pct = Math.round(((rv.questionNumber - 1) / rv.total) * 100);
  const roundScore = s.score[`round_${rv.roundNumber}_score`] ?? 0;
  const urgent = seconds <= 5;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <div>
          <span className="font-semibold">Round {rv.roundNumber}</span>
          <span className="text-mute"> · {rv.title.split("·")[1] ?? rv.title}</span>
        </div>
        <div className="font-medium">{roundScore} pts this round</div>
      </div>

      <div className="h-2 rounded-full bg-surface overflow-hidden" role="progressbar"
        aria-valuenow={rv.questionNumber} aria-valuemin={1} aria-valuemax={rv.total}
        aria-label={`Question ${rv.questionNumber} of ${rv.total}`}>
        <div className="h-full brandmark transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="bg-surface rounded-card shadow-card p-5 sm:p-7">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-mute">Question {rv.questionNumber} / {rv.total}</span>
          <span aria-live="polite"
            className={`font-display text-2xl font-bold tabular-nums rounded-xl px-3 py-1 ${urgent ? "bg-danger text-white" : "bg-gold-pale"}`}>
            {seconds}s
          </span>
        </div>

        {rv.paused ? (
          <p className="text-center py-10 text-lg font-medium">Round paused — hold tight, the facilitator will resume shortly.</p>
        ) : (
          <>
            <h2 className="text-xl font-semibold leading-snug">{rv.question.en}</h2>
            <p className="ar text-lg mt-2 text-mute" dir="rtl" lang="ar">{rv.question.ar}</p>

            <div className="mt-5 grid gap-3" role="radiogroup" aria-label="Answer choices">
              {rv.question.options.map((opt: string, i: number) => (
                <button key={i} role="radio" aria-checked={selected === i}
                  onClick={() => setSelected(i)}
                  className={`text-left rounded-xl border-2 px-4 py-3.5 min-h-[52px] transition
                    ${selected === i ? "border-gold bg-gold-pale font-semibold" : "border-mute/20 bg-sand/40 hover:border-gold/50"}`}>
                  <span className="text-mute mr-2 font-mono">{String.fromCharCode(65 + i)}</span>{opt}
                </button>
              ))}
            </div>

            <button onClick={submit} disabled={selected === null || submitting}
              className="mt-5 w-full brandmark text-white font-semibold rounded-xl py-3.5 shadow-card disabled:opacity-40">
              {submitting ? "Submitting…" : selected === null ? "Select an answer to continue" : "Submit answer"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function RoundDone({ s, between = false }: { s: any; between?: boolean }) {
  const last = s.state.current_round;
  const roundScore = last ? s.score[`round_${last}_score`] ?? 0 : 0;
  return (
    <div className="space-y-4 rise text-center">
      <div className="bg-surface rounded-card shadow-card p-8">
        <p className="text-xs uppercase tracking-widest text-mute">Round {last} complete</p>
        <p className="font-display text-6xl font-bold gold-text mt-2">{roundScore}</p>
        <p className="text-mute">points this round</p>
        <div className="grid grid-cols-3 gap-3 mt-6 text-sm">
          <Stat label="Total score" value={s.score.total_score} />
          <Stat label="Correct answers" value={s.score.correct_count} />
          <Stat label="Live rank" value={s.rank ? `#${s.rank}` : "—"} />
        </div>
      </div>
      <div className="bg-gold-pale rounded-card p-5">
        {between && <p className="font-semibold text-ok mb-1">✓ You're through to the next stage!</p>}
        <p className="font-medium">{between ? "Catch your breath — the next round starts from the stage." : "You've finished this round. Waiting for everyone to wrap up — the cut is announced when the round ends."}</p>
        <p className="ar mt-1" dir="rtl" lang="ar">استعد — الجولة التالية تبدأ من المسرح.</p>
      </div>
    </div>
  );
}

function EliminatedRoom({ s }: { s: any }) {
  return (
    <div className="space-y-4 rise text-center">
      <div className="bg-surface rounded-card shadow-card p-8">
        <p className="text-xs uppercase tracking-widest text-terra-deep font-semibold">CEO race complete for you</p>
        <p className="font-display text-5xl font-bold gold-text mt-2">{s.score.total_score}</p>
        <p className="text-mute">total points · rank #{s.rank ?? "—"}</p>
        <p className="mt-5 text-lg font-medium">Your founder journey continues — you're in the draft pool.</p>
        <p className="text-mute mt-1">The Top 15 CEOs will build their startups from students exactly like you. Watch the stage for the reveal and the live draft.</p>
        <p className="ar mt-2" dir="rtl" lang="ar">رحلتك كمؤسس مستمرة — أنت الآن ضمن قائمة الاختيار. سيبني الرؤساء التنفيذيون الخمسة عشر فرقهم من طلاب مثلك تماماً.</p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-sand/60 rounded-xl p-3">
      <div className="font-display text-2xl font-bold">{value}</div>
      <div className="text-xs text-mute">{label}</div>
    </div>
  );
}

function CeoReveal({ s }: { s: any }) {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold text-center rise">The Top 15 <span className="gold-text">CEOs</span></h1>
      <div className="grid sm:grid-cols-2 gap-3">
        {s.teams.map((t: any, i: number) => (
          <div key={t.id} className="bg-surface rounded-card shadow-card p-4 flex items-center gap-4 ceo-pop" style={{ animationDelay: `${i * 0.15}s` }}>
            <div className="brandmark text-white font-display font-bold rounded-xl h-12 w-12 grid place-items-center text-lg">{t.startup_number}</div>
            <div>
              <div className="font-semibold">{t.students?.full_name}</div>
              <div className="text-sm text-mute">{t.students?.school} · Startup #{t.startup_number} · <span className="text-gold-deep font-semibold">CEO ★</span></div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-center text-mute">The team draft opens next — CEOs will build their startups live.</p>
    </div>
  );
}

function DraftView({ s }: { s: any }) {
  const onClock = s.state.draft_current_team;
  return (
    <div className="space-y-4">
      <div className="bg-surface rounded-card shadow-card p-5 text-center">
        <p className="text-xs uppercase tracking-widest text-mute">Live team draft · pick {s.state.draft_pick_number}</p>
        <p className="font-display text-2xl font-bold mt-1">Startup #{onClock} is on the clock</p>
        <p className="text-sm text-mute mt-1">Watch the stage — the facilitator records each CEO's pick.</p>
      </div>
      <TeamGrid s={s} highlight={onClock} />
    </div>
  );
}

function FinalTeams({ s }: { s: any }) {
  const mine = s.teams.find((t: any) => t.id === s.myTeamId);
  return (
    <div className="space-y-5">
      {mine && (
        <div className="bg-surface rounded-card shadow-card p-6 border-2 border-gold rise">
          <p className="text-xs uppercase tracking-widest text-gold-deep font-semibold">Your startup</p>
          <TeamCard t={mine} members={s.members} big />
        </div>
      )}
      <details className="bg-surface rounded-card shadow-card p-5">
        <summary className="cursor-pointer font-semibold">View all 12 startups</summary>
        <div className="mt-4"><TeamGrid s={s} /></div>
      </details>
      <button onClick={() => window.print()} className="no-print w-full border-2 border-ink/20 rounded-xl py-3 font-semibold bg-surface">
        Print / save team summary
      </button>
    </div>
  );
}

function TeamGrid({ s, highlight }: { s: any; highlight?: number | null }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {s.teams.map((t: any) => (
        <div key={t.id} className={`bg-surface rounded-card shadow-card p-4 ${highlight === t.startup_number ? "ring-2 ring-gold" : ""}`}>
          <TeamCard t={t} members={s.members} />
        </div>
      ))}
    </div>
  );
}

function TeamCard({ t, members, big = false }: { t: any; members: any[]; big?: boolean }) {
  const team = members.filter(m => m.team_id === t.id);
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className={`font-display font-bold ${big ? "text-2xl" : "text-lg"}`}>Startup #{t.startup_number}</span>
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {team.map((m, i) => (
          <li key={i} className="flex justify-between gap-2">
            <span>{(m.students as any)?.full_name}</span>
            <span className={m.position === "ceo" ? "text-gold-deep font-semibold" : "text-mute text-xs self-center"}>
              {m.position === "ceo" ? "CEO ★" : POSITION_LABEL[m.position as keyof typeof POSITION_LABEL] ?? ""}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-mute mt-2">{team.length} / 4 members</p>
    </div>
  );
}
