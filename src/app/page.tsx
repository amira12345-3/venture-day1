"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function StudentLogin() {
  const router = useRouter();
  const [form, setForm] = useState({ full_name: "", student_id: "", school: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    const res = await fetch("/api/student/join", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form)
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Something went wrong. Try again."); return; }
    router.push("/play");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <Brand />
        <Link href="/admin/login"
          className="text-sm text-mute hover:text-ink border border-mute/30 rounded-full px-4 py-1.5 bg-surface/60">
          Admin Login
        </Link>
      </header>

      <main className="flex-1 grid place-items-center px-4 pb-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-6 rise">
            <h1 className="font-display text-4xl font-bold">Enter <span className="gold-text">VENTURE</span></h1>
            <p className="text-mute mt-2">Three rounds. Twelve startups. Your seat at the table starts here.</p>
            <p className="ar mt-1 text-mute" dir="rtl" lang="ar">ثلاث جولات، اثنتا عشرة شركة ناشئة — مقعدك على الطاولة يبدأ من هنا.</p>
          </div>

          <form onSubmit={join} className="bg-surface rounded-card shadow-card p-6 space-y-4 rise-delay" noValidate>
            <div>
              <label htmlFor="full_name" className="block text-sm font-semibold mb-1">Full name · <span className="ar" lang="ar">الاسم الكامل</span></label>
              <input id="full_name" required autoComplete="name" value={form.full_name}
                onChange={e => setForm({ ...form, full_name: e.target.value })}
                className="w-full rounded-xl border border-mute/30 px-4 py-3 bg-sand/40" placeholder="e.g. Salem Al Marri" />
            </div>
            <div>
              <label htmlFor="student_id" className="block text-sm font-semibold mb-1">Student ID · <span className="ar" lang="ar">الرقم الطلابي</span></label>
              <input id="student_id" required value={form.student_id}
                onChange={e => setForm({ ...form, student_id: e.target.value })}
                className="w-full rounded-xl border border-mute/30 px-4 py-3 bg-sand/40" placeholder="e.g. RQ-2026-045" />
              <p className="text-xs text-mute mt-1">Returning? Use the same Student ID to reconnect — your progress is saved.</p>
            </div>
            <div>
              <label htmlFor="school" className="block text-sm font-semibold mb-1">School or institution · <span className="ar" lang="ar">المدرسة أو المؤسسة</span></label>
              <input id="school" value={form.school}
                onChange={e => setForm({ ...form, school: e.target.value })}
                className="w-full rounded-xl border border-mute/30 px-4 py-3 bg-sand/40" placeholder="e.g. ASCS Sharjah" />
            </div>

            {error && <p role="alert" className="text-danger text-sm font-medium">{error}</p>}

            <button type="submit" disabled={busy}
              className="w-full brandmark text-white font-semibold rounded-xl py-3.5 shadow-card disabled:opacity-60">
              {busy ? "Joining…" : "Enter VENTURE"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
