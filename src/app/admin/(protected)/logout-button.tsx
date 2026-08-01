"use client";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => { await fetch("/api/admin/logout", { method: "POST" }); router.push("/"); router.refresh(); }}
      className="text-xs bg-ink text-white rounded-full px-3 py-1">
      Log out
    </button>
  );
}
