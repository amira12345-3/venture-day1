"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen grid place-items-center px-4 text-center">
      <div className="space-y-4">
        <h1 className="font-display text-3xl font-bold">Something went wrong</h1>
        <p className="text-mute">Your progress is safe on the server. Try again — if it keeps happening, tell a facilitator.</p>
        <button onClick={reset} className="brandmark text-white rounded-xl px-6 py-3 font-semibold shadow-card">Try again</button>
      </div>
    </div>
  );
}
