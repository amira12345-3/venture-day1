export function Brand({ sub = "Day 1 Live" }: { sub?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div aria-hidden className="brandmark h-10 w-10 rounded-xl shadow-card grid place-items-center text-white font-display text-xl font-bold">V</div>
      <div className="leading-tight">
        <div className="font-display text-xl font-semibold tracking-wide">VENTURE</div>
        <div className="text-xs uppercase tracking-[0.2em] text-mute">{sub}</div>
      </div>
    </div>
  );
}
