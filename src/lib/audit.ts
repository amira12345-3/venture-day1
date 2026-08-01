import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function audit(entry: {
  admin_id: string | null;
  action: string;
  entity_type?: string;
  entity_id?: string;
  previous_value?: unknown;
  new_value?: unknown;
  reason?: string;
}) {
  const db = supabaseAdmin();
  await db.from("audit_logs").insert({
    admin_id: entry.admin_id,
    action: entry.action,
    entity_type: entry.entity_type ?? null,
    entity_id: entry.entity_id ?? null,
    previous_value: entry.previous_value ?? null,
    new_value: entry.new_value ?? null,
    reason: entry.reason ?? null
  });
}
