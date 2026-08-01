import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AccountActions, InviteForm } from "./actions";

export const dynamic = "force-dynamic";

export default async function Accounts() {
  const admin = (await currentAdmin())!;
  if (admin.role !== "super_admin") redirect("/admin/dashboard");
  const db = supabaseAdmin();

  const { data: admins } = await db.from("admins")
    .select("id, full_name, email, role, status, created_at, last_login_at").order("created_at");
  const { data: activity } = await db.from("audit_logs")
    .select("created_at, action, admins(full_name)")
    .order("created_at", { ascending: false }).limit(15);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold">Admin accounts</h1>

      <InviteForm />

      <div className="bg-surface rounded-card shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-mute border-b border-sand">
            <tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Role</th>
                <th className="p-3">Status</th><th className="p-3">Last login</th><th className="p-3">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-sand">
            {(admins ?? []).map(a => (
              <tr key={a.id} className={a.status === "disabled" ? "opacity-50" : ""}>
                <td className="p-3 font-medium">{a.full_name}{a.id === admin.id && <span className="text-mute text-xs"> (you)</span>}</td>
                <td className="p-3">{a.email}</td>
                <td className="p-3">{a.role}</td>
                <td className="p-3">{a.status}</td>
                <td className="p-3 text-mute">{a.last_login_at ? new Date(a.last_login_at).toLocaleString() : "never"}</td>
                <td className="p-3"><AccountActions target={a} selfId={admin.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="bg-surface rounded-card shadow-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Recent admin activity</h2>
          <a href="/api/admin/export?type=audit" className="text-sm underline text-gold-deep font-medium">Full audit log CSV</a>
        </div>
        <ul className="text-sm divide-y divide-sand">
          {(activity ?? []).map((l: any, i) => (
            <li key={i} className="py-2 flex justify-between">
              <span><span className="font-medium">{l.admins?.full_name ?? "system"}</span> · {l.action}</span>
              <span className="text-mute">{new Date(l.created_at).toLocaleTimeString()}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
