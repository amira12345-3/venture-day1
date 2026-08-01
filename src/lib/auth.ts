// ============================================================
// Server-side authorization. EVERY protected API route calls one of
// these before touching data. Hiding buttons in the UI is cosmetic;
// this file (plus RLS in the database) is the real boundary.
// ============================================================
import "server-only";
import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AdminRole } from "@/lib/types";

const ROLE_RANK: Record<AdminRole, number> = { viewer: 1, facilitator: 2, super_admin: 3 };

export interface AdminIdentity {
  id: string;
  full_name: string;
  email: string;
  role: AdminRole;
}

/** Resolve the signed-in admin from the HTTP-only Supabase auth cookie. */
export async function currentAdmin(): Promise<AdminIdentity | null> {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser(); // validates JWT server-side
  if (!user) return null;
  const db = supabaseAdmin();
  const { data } = await db.from("admins")
    .select("id, full_name, email, role, status")
    .eq("id", user.id).single();
  if (!data || data.status !== "active") return null;
  return { id: data.id, full_name: data.full_name, email: data.email, role: data.role };
}

/**
 * Gate for API routes. Returns the admin, or a ready-made 401/403 response.
 *   const gate = await requireAdmin("facilitator");
 *   if (gate instanceof NextResponse) return gate;
 */
export async function requireAdmin(minRole: AdminRole = "viewer"): Promise<AdminIdentity | NextResponse> {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (ROLE_RANK[admin.role] < ROLE_RANK[minRole]) {
    return NextResponse.json({ error: "Your role does not allow this action." }, { status: 403 });
  }
  return admin;
}

// ============================================================
// Student sessions — no passwords, but still server-verified.
// Cookie: vstud = <studentUuid>.<token>.<hmac(uuid.token)>
//   · HMAC (STUDENT_SESSION_SECRET) stops cookie forgery.
//   · sha256(token) is stored in students.session_token_hash so a
//     facilitator can invalidate a session, and a returning student
//     reconnecting with the same Student ID rotates the token —
//     which blocks casual impersonation from a second device.
// ============================================================
const STUDENT_COOKIE = "vstud";

function hmac(value: string) {
  return createHmac("sha256", process.env.STUDENT_SESSION_SECRET!).update(value).digest("hex");
}
export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function issueStudentToken(): string {
  return randomBytes(24).toString("hex");
}

export function setStudentCookie(res: NextResponse, studentUuid: string, token: string) {
  const payload = `${studentUuid}.${token}`;
  res.cookies.set(STUDENT_COOKIE, `${payload}.${hmac(payload)}`, {
    httpOnly: true, sameSite: "lax", path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12 // one event day
  });
}

export function clearStudentCookie(res: NextResponse) {
  res.cookies.set(STUDENT_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export interface StudentIdentity {
  id: string; full_name: string; student_id: string; school: string; status: string;
  eliminated_after_round: number | null;
}

/** Resolve + verify the student from the signed cookie against the database. */
export async function currentStudent(): Promise<StudentIdentity | null> {
  const raw = cookies().get(STUDENT_COOKIE)?.value;
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [uuid, token, sig] = parts;
  const expected = hmac(`${uuid}.${token}`);
  const a = Buffer.from(sig, "utf8"), b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const db = supabaseAdmin();
  const { data } = await db.from("students")
    .select("id, full_name, student_id, school, status, session_token_hash, eliminated_after_round")
    .eq("id", uuid).single();
  if (!data || data.session_token_hash !== sha256(token)) return null;
  if (data.status !== "active") return null;
  db.from("students").update({ last_seen_at: new Date().toISOString() }).eq("id", uuid).then(() => {});
  return { id: data.id, full_name: data.full_name, student_id: data.student_id, school: data.school, status: data.status, eliminated_after_round: data.eliminated_after_round ?? null };
}

// ============================================================
// Simple in-memory rate limiter for the admin login endpoint.
// (Per server instance; pair with Supabase Auth's own limits.)
// ============================================================
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, max = 8, windowMs = 60_000): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) { buckets.set(key, { count: 1, reset: now + windowMs }); return true; }
  b.count += 1;
  return b.count <= max;
}
