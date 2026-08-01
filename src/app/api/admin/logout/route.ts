import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  const supa = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (all: { name: string; value: string; options?: Record<string, unknown> }[]) => all.forEach(({ name, value, options }) =>
          res.cookies.set(name, value, { ...options, httpOnly: true, maxAge: 0 })
        )
      }
    }
  );
  await supa.auth.signOut();
  res.cookies.set("vadm_last", "", { maxAge: 0, path: "/" });
  return res;
}
