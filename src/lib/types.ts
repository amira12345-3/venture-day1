export type AdminRole = "super_admin" | "facilitator" | "viewer";

export type ProgramStage =
  | "registration" | "round_live" | "round_paused" | "between_rounds"
  | "ceo_reveal" | "draft" | "teams_final";

export interface ProgramState {
  id: 1;
  current_stage: ProgramStage;
  current_round: number | null;
  leaderboard_visible: boolean;
  ceos_revealed: boolean;
  draft_locked: boolean;
  teams_revealed: boolean;
  draft_pick_number: number;
  draft_current_team: number | null;
  updated_at: string;
}

export type TeamPosition = "ceo" | "tech" | "design" | "business";

export const POSITION_LABEL: Record<TeamPosition, string> = {
  ceo: "CEO",
  tech: "Technical Lead · AI & Build",
  design: "Design & Research Lead",
  business: "Business & Marketing Lead"
};

export const CEO_COUNT = 15;
export const TEAM_SIZE = 4; // CEO + 3 leads

// Elimination format: how many students REMAIN in the CEO race after each round.
export const KEEP_AFTER_ROUND: Record<number, number> = { 1: 45, 2: 30, 3: 15 };

export const PILLARS = [
  "Food Security",
  "Education",
  "Public Health",
  "Environmental Transformation",
  "Green Economy"
] as const;
