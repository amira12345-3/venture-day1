"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

async function api(payload: Record<string, unknown>) {
  const res = await fetch("/api/admin/questions", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) alert(data.error ?? "Failed.");
  return res.ok;
}

export function RoundSettings({ round }: { round: any }) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        const time = Number(prompt("Seconds per question:", String(round.time_per_question)));
        const pts = Number(prompt("Points per question:", String(round.points_per_question)));
        if (time > 0 && pts > 0 &&
          await api({ action: "update_round", round_number: round.round_number, time_per_question: time, points_per_question: pts })) {
          router.refresh();
        }
      }}
      className="text-xs border border-mute/30 rounded-full px-3 py-1 bg-sand/50">
      {round.time_per_question}s · {round.points_per_question} pts — change
    </button>
  );
}

export function QuestionActions({ question, roundId, addNew = false }: { question?: any; roundId: string; addNew?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function edit(q?: any) {
    const question_en = prompt("English question:", q?.question_en ?? "");
    if (!question_en) return;
    const question_ar = prompt("Arabic question:", q?.question_ar ?? "") ?? "";
    const options = [0, 1, 2, 3].map(i => prompt(`Option ${i + 1}:`, q?.options?.[i] ?? "") ?? "");
    if (options.some(o => !o)) { alert("All four options are required."); return; }
    const correct = Number(prompt("Correct option number (1–4):", q ? String(q.correct_answer + 1) : ""));
    if (!(correct >= 1 && correct <= 4)) { alert("Correct option must be 1–4."); return; }
    const pillar = prompt("Pillar (optional — Round 3 only):", q?.pillar ?? "") || null;
    const display_order = Number(prompt("Display order:", String(q?.display_order ?? 999)));
    setBusy(true);
    const ok = await api({ action: "upsert", question: {
      id: q?.id, round_id: roundId, question_en, question_ar, options,
      correct_answer: correct - 1, pillar, display_order, active: q?.active ?? true
    }});
    setBusy(false);
    if (ok) router.refresh();
  }

  if (addNew) {
    return <button onClick={() => edit()} disabled={busy}
      className="text-sm border border-dashed border-mute/40 rounded-xl px-4 py-2 text-mute hover:text-ink w-full">＋ Add question</button>;
  }

  return (
    <div className="flex gap-2 shrink-0 text-xs">
      <button onClick={() => edit(question)} className="border border-mute/30 rounded-full px-3 py-1">Edit</button>
      <button onClick={async () => { if (await api({ action: "toggle_active", id: question.id, active: !question.active })) router.refresh(); }}
        className="border border-mute/30 rounded-full px-3 py-1">{question.active ? "Deactivate" : "Activate"}</button>
      <button onClick={async () => { if (confirm("Delete this question?") && await api({ action: "delete", id: question.id })) router.refresh(); }}
        className="text-danger border border-danger/30 rounded-full px-3 py-1">Delete</button>
    </div>
  );
}
