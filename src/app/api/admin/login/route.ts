// Admin sign-in. Credentials are verified by Supabase Auth (bcrypt-hashed
// passwords). The session lands in HTTP-only cookies — never localStorage.
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (!rateLimit(`admlogin:${ip}`, 8)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }
  const { email, password } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  const supa = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (all: { name: string; value: string; options?: Record<string, unknown> }[]) => all.forEach(({ name, value, options }) =>
          res.cookies.set(name, value, { ...options, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" })
        )
      }
    }
  );

  const { data, error } = await supa.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data: admin } = await db.from("admins")
    .select("id, role, status").eq("id", data.user.id).maybeSingle();
  if (!admin || admin.status !== "active") {
    await supa.auth.signOut();
    return NextResponse.json({ error: "This account does not have admin access." }, { status: 403 });
  }
  await db.from("admins").update({ last_login_at: new Date().toISOString() }).eq("id", admin.id);
  return res;
}
