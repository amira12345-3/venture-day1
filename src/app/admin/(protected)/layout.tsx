// Server-side gate for every admin page. Middleware already redirects
// unauthenticated visitors; this layout re-verifies the ADMIN ROLE against
// the database on each render and builds the admin chrome.
import { redirect } from "next/navigation";
import Link from "next/link";
import { currentAdmin } from "@/lib/auth";
import { Brand } from "@/components/Brand";
import { LogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin", facilitator: "Facilitator", viewer: "Viewer"
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");

  return (
    <div className="min-h-screen">
      <header className="bg-surface shadow-card px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-6">
          <Brand sub="Admin" />
          <nav className="hidden md:flex gap-4 text-sm font-medium">
            <Link href="/admin/dashboard" className="hover:text-gold-deep">Dashboard</Link>
            <Link href="/admin/students" className="hover:text-gold-deep">Students</Link>
            <Link href="/admin/draft" className="hover:text-gold-deep">Draft & Teams</Link>
            {admin.role === "super_admin" && <>
              <Link href="/admin/questions" className="hover:text-gold-deep">Questions</Link>
              <Link href="/admin/accounts" className="hover:text-gold-deep">Admins</Link>
            </>}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium">{admin.full_name}</span>
          <span className="bg-gold-pale rounded-full px-3 py-1 text-xs font-semibold">{ROLE_LABEL[admin.role]}</span>
          <Link href="/play" className="text-mute hover:text-ink text-xs border border-mute/30 rounded-full px-3 py-1">Student view</Link>
          <LogoutButton />
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
