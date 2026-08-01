"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function AdminLoginPage() {
  return <Suspense><AdminLogin /></Suspense>;
}

function AdminLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("timeout") ? "You were signed out after a period of inactivity." : null
  );
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    const res = await fetch("/api/admin/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Sign-in failed."); return; }
    router.push("/admin/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6"><Brand sub="Facilitator access" /></div>
        <form onSubmit={signIn} className="bg-surface rounded-card shadow-card p-6 space-y-4">
          <div className="text-center">
            <span aria-hidden className="inline-grid place-items-center h-10 w-10 rounded-full bg-gold-pale text-lg">🔒</span>
            <h1 className="font-display text-2xl font-bold mt-2">Admin sign in</h1>
            <p className="text-xs text-mute mt-1">Authorized personnel only</p>
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-semibold mb-1">Email address</label>
            <input id="email" type="email" required autoComplete="username" value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-xl border border-mute/30 px-4 py-3 bg-sand/40" />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-semibold mb-1">Password</label>
            <div className="relative">
              <input id="password" type={show ? "text" : "password"} required autoComplete="current-password"
                value={password} onChange={e => setPassword(e.target.value)}
                className="w-full rounded-xl border border-mute/30 px-4 py-3 bg-sand/40 pr-16" />
              <button type="button" onClick={() => setShow(v => !v)}
                aria-label={show ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-mute px-2 py-1">
                {show ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error && <p role="alert" className="text-danger text-sm font-medium">{error}</p>}

          <button type="submit" disabled={busy}
            className="w-full brandmark text-white font-semibold rounded-xl py-3 shadow-card disabled:opacity-60">
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-center text-xs text-mute">
            Forgot your password? Ask a Super Admin to reset it from Manage Admins.
          </p>
        </form>
        <p className="text-center mt-4"><Link href="/" className="text-sm text-mute hover:text-ink">← Back to student entry</Link></p>
      </div>
    </div>
  );
}
