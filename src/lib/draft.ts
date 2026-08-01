// Snake-draft order helper: teams 1→15, then 15→1, reversing every round.
export const DRAFT_TEAMS = 15;

/** startup_number on the clock for global pick n (1-based). */
export function teamForPick(n: number): number {
  const round = Math.floor((n - 1) / DRAFT_TEAMS);
  const pos = (n - 1) % DRAFT_TEAMS;
  return round % 2 === 0 ? pos + 1 : DRAFT_TEAMS - pos;
}
