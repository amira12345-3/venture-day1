"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

async function api(payload: Record<string, unknown>) {
  const res = await fetch("/api/admin/accounts", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) alert(data.error ?? "Failed.");
  return res.ok;
}

export function InviteForm() {
  const router = useRouter();
  const [form, setForm] = useState({ full_name: "", email: "", role: "facilitator", temp_password: "" });
  const [busy, setBusy] = useState(false);
  return (
    <form className="bg-surface rounded-card shadow-card p-5 grid sm:grid-cols-5 gap-3 items-end"
      onSubmit={async e => {
        e.preventDefault(); setBusy(true);
        if (await api({ action: "invite", ...form })) { setForm({ full_name: "", email: "", role: "facilitator", temp_password: "" }); router.refresh(); }
        setBusy(false);
      }}>
      <label className="text-sm font-medium">Full name
        <input required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })}
          className="mt-1 w-full rounded-xl border border-mute/30 px-3 py-2 bg-sand/40" /></label>
      <label className="text-sm font-medium">Email
        <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
          className="mt-1 w-full rounded-xl border border-mute/30 px-3 py-2 bg-sand/40" /></label>
      <label className="text-sm font-medium">Role
        <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
          className="mt-1 w-full rounded-xl border border-mute/30 px-3 py-2 bg-sand/40">
          <option value="facilitator">Facilitator</option>
          <option value="viewer">Viewer</option>
          <option value="super_admin">Super Admin</option>
        </select></label>
      <label className="text-sm font-medium">Temporary password
        <input required minLength={10} value={form.temp_password} onChange={e => setForm({ ...form, temp_password: e.target.value })}
          className="mt-1 w-full rounded-xl border border-mute/30 px-3 py-2 bg-sand/40" placeholder="10+ characters" /></label>
      <button disabled={busy} className="brandmark text-white rounded-xl px-4 py-2.5 font-semibold text-sm">
        {busy ? "Inviting…" : "Invite facilitator"}
      </button>
    </form>
  );
}

export function AccountActions({ target, selfId }: { target: any; selfId: string }) {
  const router = useRouter();
  if (target.id === selfId) return <span className="text-xs text-mute">—</span>;
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <button onClick={async () => {
        const role = prompt("Role (super_admin / facilitator / viewer):", target.role);
        if (role && await api({ action: "set_role", target_id: target.id, role })) router.refresh();
      }} className="border border-mute/30 rounded-full px-3 py-1">Role</button>
      <button onClick={async () => {
        const status = target.status === "active" ? "disabled" : "active";
        if (confirm(`${status === "disabled" ? "Disable" : "Enable"} ${target.email}?`) &&
          await api({ action: "set_status", target_id: target.id, status })) router.refresh();
      }} className="border border-mute/30 rounded-full px-3 py-1">{target.status === "active" ? "Disable" : "Enable"}</button>
      <button onClick={async () => {
        const new_password = prompt("New password (10+ characters):");
        if (new_password && await api({ action: "reset_password", target_id: target.id, new_password })) {
          alert("Password reset. Share it with the admin securely — it is not stored anywhere in plain text.");
        }
      }} className="border border-mute/30 rounded-full px-3 py-1">Reset password</button>
      <button onClick={async () => {
        if (confirm(`Remove admin access for ${target.email}? This deletes the account.`) &&
          await api({ action: "remove", target_id: target.id })) router.refresh();
      }} className="text-danger border border-danger/30 rounded-full px-3 py-1">Remove</button>
    </div>
  );
}
