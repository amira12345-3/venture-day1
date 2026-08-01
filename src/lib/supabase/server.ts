// Server-side Supabase client bound to the request's HTTP-only auth cookies.
// Used to identify the signed-in ADMIN. Sessions never touch localStorage.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function supabaseServer() {
  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (all: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          try {
            all.forEach(({ name, value, options }) =>
              store.set(name, value, { ...options, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" })
            );
          } catch { /* called from a Server Component — middleware refreshes instead */ }
        }
      }
    }
  );
}
