import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentAdmin } from "@/lib/auth";
import { StudentRowActions } from "./row-actions";

export const dynamic = "force-dynamic";

export default async function Students({ searchParams }: { searchParams: { q?: string; school?: string } }) {
  const admin = (await currentAdmin())!;
  const db = supabaseAdmin();
  const q = (searchParams.q ?? "").trim();
  const school = (searchParams.school ?? "").trim();

  let query = db.from("students")
    .select("id, full_name, student_id, school, status, is_demo, last_seen_at, student_scores(round_1_score, round_2_score, round_3_score, total_score)")
    .order("full_name").limit(300);
  if (q) query = query.or(`full_name.ilike.%${q}%,student_id.ilike.%${q}%`);
  if (school) query = query.ilike("school", `%${school}%`);
  const { data: students } = await query;

  const { data: schools } = await db.from("students").select("school").neq("school", "");
  const schoolList = [...new Set((schools ?? []).map(s => s.school))].sort();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">Students</h1>
        <a href="/api/admin/export?type=students" className="text-sm underline text-gold-deep font-medium">Export CSV</a>
      </div>

      <form className="flex flex-wrap gap-3" method="get">
        <input name="q" defaultValue={q} placeholder="Search name or Student ID"
          aria-label="Search by name or Student ID"
          className="rounded-xl border border-mute/30 px-4 py-2 bg-surface flex-1 min-w-48" />
        <select name="school" defaultValue={school} aria-label="Filter by school"
          className="rounded-xl border border-mute/30 px-4 py-2 bg-surface">
          <option value="">All schools</option>
          {schoolList.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="brandmark text-white rounded-xl px-5 py-2 font-semibold text-sm">Search</button>
      </form>

      <div className="bg-surface rounded-card shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-mute border-b border-sand">
            <tr>
              <th className="p-3">Student</th><th className="p-3">School</th>
              <th className="p-3 text-right">R1</th><th className="p-3 text-right">R2</th>
              <th className="p-3 text-right">R3</th><th className="p-3 text-right">Total</th>
              <th className="p-3">Status</th><th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand">
            {(students ?? []).map((s: any) => (
              <tr key={s.id} className={s.status !== "active" ? "opacity-50" : ""}>
                <td className="p-3">
                  <div className="font-medium">{s.full_name}{s.is_demo && <span className="ml-2 text-xs bg-terra/15 text-terra-deep rounded px-1.5">DEMO</span>}</div>
                  <div className="text-mute text-xs">{s.student_id}</div>
                </td>
                <td className="p-3">{s.school || "—"}</td>
                <td className="p-3 text-right tabular-nums">{s.student_scores?.round_1_score ?? 0}</td>
                <td className="p-3 text-right tabular-nums">{s.student_scores?.round_2_score ?? 0}</td>
                <td className="p-3 text-right tabular-nums">{s.student_scores?.round_3_score ?? 0}</td>
                <td className="p-3 text-right font-semibold tabular-nums">{s.student_scores?.total_score ?? 0}</td>
                <td className="p-3">{s.status}</td>
                <td className="p-3"><StudentRowActions student={s} canEdit={admin.role !== "viewer"} /></td>
              </tr>
            ))}
            {!students?.length && <tr><td colSpan={8} className="p-6 text-center text-mute">No students match. Clear the search to see everyone.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
