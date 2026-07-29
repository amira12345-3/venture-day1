// Creates the first Super Admin. Run locally with the service-role key —
// there is deliberately NO public admin signup page.
// Usage:
//   BOOTSTRAP_ADMIN_EMAIL=you@school.ae BOOTSTRAP_ADMIN_PASSWORD='Strong#Pass1' \
//   BOOTSTRAP_ADMIN_NAME='Amira' node scripts/create-super-admin.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

for (const f of [".env.local", ".env"]) {
  if (existsSync(f)) for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const name = process.env.BOOTSTRAP_ADMIN_NAME || "Super Admin";
if (!url || !key || !email || !password) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD");
  process.exit(1);
}
if (password.length < 10) { console.error("Use a password of at least 10 characters."); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: user, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
if (error) { console.error(error.message); process.exit(1); }
const { error: aErr } = await db.from("admins").insert({
  id: user.user.id, full_name: name, email, role: "super_admin", status: "active"
});
if (aErr) { console.error(aErr.message); process.exit(1); }
console.log(`Super Admin created: ${email}. Passwords are hashed by Supabase Auth (bcrypt).`);
