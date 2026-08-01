// Service-role client — SERVER ONLY. Bypasses RLS, so it is used exclusively
// inside API routes AFTER an explicit role check (see lib/auth.ts).
// The key is read from env and never bundled into client code.
import "server-only";
import { createClient } from "@supabase/supabase-js";

export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
