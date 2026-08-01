"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function StudentRowActions({ student, canEdit }: { student: any; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!canEdit) return <span className="text-xs text-mute">read only</span>;

  async function call(payload: Record<string, unknown>) {
    setMsg(null);
    const res = await fetch("/api/admin/students", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_id: student.id, ...payload })
    });
    const data = await res.json();
    if (!res.ok) { setMsg(data.error ?? "Failed."); return; }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)} aria-expanded={open} aria-haspopup="menu"
        className="text-xs border border-mute/30 rounded-full px-3 py-1 bg-sand/50">Manage ▾</button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 bg-surface rounded-xl shadow-card p-2 w-64 space-y-1 text-xs">
          <MenuBtn label="Edit name / ID / school" onClick={() => {
            const full_name = prompt("Full name:", student.full_name) ?? student.full_name;
            const new_student_id = prompt("Student ID:", student.student_id) ?? student.student_id;
            const school = prompt("School:", student.school) ?? student.school;
            call({ action: "edit", full_name, new_student_id, school });
          }} />
          <MenuBtn label="Correct a score (reason required)" onClick={() => {
            const round = Number(prompt("Round (1, 2, or 3):"));
            const new_score = Number(prompt("New score for that round:"));
            const reason = prompt("Reason (required — recorded in the audit log):");
            if (!reason) { setMsg("A reason is required."); return; }
            call({ action: "correct_score", round, new_score, reason });
          }} />
          {student.status === "active"
            ? <MenuBtn label="Disqualify" danger onClick={() => {
                const reason = prompt("Reason for disqualification:") ?? undefined;
                call({ action: "disqualify", reason });
              }} />
            : <MenuBtn label="Reactivate" onClick={() => call({ action: "reactivate" })} />}
          <MenuBtn label="Reset one round" onClick={() => {
            const round = Number(prompt("Reset which round (1, 2, or 3)?"));
            const reason = prompt("Reason:") ?? undefined;
            if ([1, 2, 3].includes(round) && confirm(`Delete this student's Round ${round} answers?`)) {
              call({ action: "reset_round", round, reason });
            }
          }} />
          <MenuBtn label="Reset entire progress" danger onClick={() => {
            const reason = prompt("Reason:") ?? undefined;
            if (confirm("Delete ALL answers and scores for this student?")) call({ action: "reset_all", reason });
          }} />
          <MenuBtn label="Delete duplicate record" danger onClick={() => {
            const reason = prompt("Reason (e.g. duplicate of RQ-2026-045):") ?? undefined;
            if (confirm("Permanently delete this student record?")) call({ action: "delete_duplicate", reason });
          }} />
        </div>
      )}
      {msg && <p role="alert" className="text-danger mt-1">{msg}</p>}
    </div>
  );
}

function MenuBtn({ label, onClick, danger = false }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button role="menuitem" onClick={onClick}
      className={`block w-full text-left rounded-lg px-3 py-2 hover:bg-sand ${danger ? "text-danger" : ""}`}>
      {label}
    </button>
  );
}
