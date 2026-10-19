/**
 * Team-color accents for chain edges.
 *
 * Connections only carry the team mascot ("Bulls", "Blazers"), so the curated
 * table is keyed by mascot and covers the 30 current NBA franchises. Every
 * other team — the dataset spans 1950–2026 and dozens of defunct franchises —
 * falls back to a stable hue derived from its name, so no edge is left gray.
 *
 * Colors are mid-tone on purpose: they have to read on both the light and dark
 * surfaces without a second per-theme palette.
 */
const TEAM_ACCENTS: Record<string, string> = {
  hawks: "#e03a3e",
  celtics: "#008348",
  nets: "#6b7a8f",
  hornets: "#00828c",
  bulls: "#ce1141",
  cavaliers: "#9c1f45",
  pistons: "#c8102e",
  pacers: "#1d5fa8",
  heat: "#b5203a",
  bucks: "#00703c",
  knicks: "#006bb6",
  magic: "#0077c0",
  "76ers": "#ed174c",
  raptors: "#ce1141",
  wizards: "#e31837",
  mavericks: "#0b6eb4",
  nuggets: "#418fde",
  warriors: "#2d5da8",
  rockets: "#ce1141",
  clippers: "#c8102e",
  lakers: "#8a5cd6",
  grizzlies: "#5d76a9",
  timberwolves: "#236192",
  pelicans: "#c99700",
  thunder: "#007ac1",
  suns: "#e56020",
  blazers: "#e03a3e",
  kings: "#5a2d81",
  spurs: "#8a8d8f",
  jazz: "#f9a01b",
};

const hueFromName = (name: string): number => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 360;
  }
  return hash;
};

/**
 * Resolve a team name to an accent color, or undefined when there is no team
 * to key on (the caller should then keep its neutral fallback).
 */
export function teamAccent(teamName?: string): string | undefined {
  const normalized = teamName?.trim().toLowerCase();
  if (!normalized) return undefined;

  const mascot = normalized.split(/\s+/).pop() ?? normalized;
  return (
    TEAM_ACCENTS[mascot] ??
    TEAM_ACCENTS[normalized] ??
    `hsl(${hueFromName(normalized)} 62% 50%)`
  );
}
