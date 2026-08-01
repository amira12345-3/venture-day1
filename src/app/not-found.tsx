import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center px-4 text-center">
      <div className="space-y-4">
        <div className="flex justify-center"><Brand /></div>
        <h1 className="font-display text-4xl font-bold">This page isn't part of the program</h1>
        <p className="text-mute">Head back to the entrance and take your seat.</p>
        <Link href="/" className="inline-block brandmark text-white rounded-xl px-6 py-3 font-semibold shadow-card">Back to VENTURE</Link>
      </div>
    </div>
  );
}
