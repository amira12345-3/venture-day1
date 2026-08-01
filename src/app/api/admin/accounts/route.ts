// Super Admin section: invite facilitators, change roles, disable accounts,
// reset passwords. All through Supabase Auth admin API — no plain-text
// passwords ever stored or logged.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";

const ROLES = ["super_admin", "facilitator", "viewer"];

export async function POST(req: NextRequest) {
  const gate = await requireAdmin("super_admin");
  if (gate instanceof NextResponse) return gate;
  const admin = gate;
  const db = supabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const { action } = body;

  switch (action) {
    case "invite": {
      const { email, full_name, role, temp_password } = body;
      if (!email || !ROLES.includes(role)) return NextResponse.json({ error: "Provide an email and a valid role." }, { status: 400 });
      if (typeof temp_password !== "string" || temp_password.length < 10) {
        return NextResponse.json({ error: "Temporary password must be at least 10 characters." }, { status: 400 });
      }
      const { data: user, error } = await db.auth.admin.createUser({
        email, password: temp_password, email_confirm: true
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await db.from("admins").insert({ id: user.user.id, full_name: full_name || email, email, role, status: "active" });
      await audit({ admin_id: admin.id, action: "admin.invite", entity_type: "admin", entity_id: user.user.id, new_value: { email, role } });
      break;
    }
    case "set_role": {
      const { target_id, role } = body;
      if (!ROLES.includes(role)) return NextResponse.json({ error: "Unknown role." }, { status: 400 });
      if (target_id === admin.id && role !== "super_admin") {
        return NextResponse.json({ error: "You cannot demote your own account." }, { status: 400 });
      }
      const { data: before } = await db.from("admins").select("role").eq("id", target_id).single();
      await db.from("admins").update({ role }).eq("id", target_id);
      await audit({ admin_id: admin.id, action: "admin.set_role", entity_type: "admin", entity_id: target_id, previous_value: before, new_value: { role } });
      break;
    }
    case "set_status": {
      const { target_id, status } = body; // active | disabled
      if (target_id === admin.id) return NextResponse.json({ error: "You cannot disable your own account." }, { status: 400 });
      await db.from("admins").update({ status }).eq("id", target_id);
      if (status === "disabled") await db.auth.admin.signOut(target_id).catch(() => {});
      await audit({ admin_id: admin.id, action: "admin.set_status", entity_type: "admin", entity_id: target_id, new_value: { status } });
      break;
    }
    case "reset_password": {
      const { target_id, new_password } = body;
      if (typeof new_password !== "string" || new_password.length < 10) {
        return NextResponse.json({ error: "New password must be at least 10 characters." }, { status: 400 });
      }
      const { error } = await db.auth.admin.updateUserById(target_id, { password: new_password });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await audit({ admin_id: admin.id, action: "admin.reset_password", entity_type: "admin", entity_id: target_id });
      break;
    }
    case "remove": {
      const { target_id } = body;
      if (target_id === admin.id) return NextResponse.json({ error: "You cannot remove your own account." }, { status: 400 });
      await db.from("admins").delete().eq("id", target_id);
      await db.auth.admin.deleteUser(target_id).catch(() => {});
      await audit({ admin_id: admin.id, action: "admin.remove", entity_type: "admin", entity_id: target_id });
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
