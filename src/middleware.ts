// Protects every /admin route (except /admin/login) on the edge, refreshes
// the Supabase auth cookie, and enforces an inactivity timeout. Server API
// routes re-check the role on every call — this is the first fence, not the
// only one.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const INACTIVITY_MINUTES = 60;

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });
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

  const { data: { user } } = await supa.auth.getUser();
  const path = req.nextUrl.pathname;
  const isAdminArea = path.startsWith("/admin") && path !== "/admin/login";

  // Inactivity timeout for admins
  if (user) {
    const last = Number(req.cookies.get("vadm_last")?.value ?? 0);
    if (last && Date.now() - last > INACTIVITY_MINUTES * 60_000) {
      await supa.auth.signOut();
      const out = NextResponse.redirect(new URL("/admin/login?timeout=1", req.url));
      out.cookies.set("vadm_last", "", { maxAge: 0, path: "/" });
      return out;
    }
    res.cookies.set("vadm_last", String(Date.now()), {
      httpOnly: true, sameSite: "lax", path: "/",
      secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 8
    });
  }

  if (isAdminArea && !user) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }
  return res;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"]
};
