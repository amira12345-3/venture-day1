// Browser client (anon key only). Students and the projector use this solely
// for Realtime subscriptions + the RLS-gated public views. It cannot read
// questions, answers, or any admin table — RLS blocks it server-side.
"use client";
import { createBrowserClient } from "@supabase/ssr";

export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
