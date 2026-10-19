import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Top-scorers CSV helpers (moved from @repo/types)
// ---------------------------------------------------------------------------
const MONOREPO_TOP_SCORERS_PATH = path.resolve(
  __dirname,
  "../../..",
  "datasets/top_scorers.csv",
);
export const DEFAULT_TOP_SCORERS_LIMIT = 80;
let topScorerNamesCache: string[] | null = null;

const resolveTopScorersPaths = (): string[] => {
  const candidates: string[] = [];
  const configured = process.env.TOP_SCORERS_CSV_PATH?.trim();
  if (configured) candidates.push(configured);
  candidates.push(MONOREPO_TOP_SCORERS_PATH);
  candidates.push("/app/datasets/top_scorers.csv");
  candidates.push(path.resolve(process.cwd(), "datasets/top_scorers.csv"));
  return [...new Set(candidates)];
};

const parseTopScorerNames = (csv: string, limit: number): string[] => {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const names: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (line.toLowerCase().startsWith("rank,")) continue;
    const parts = line.split(",");
    if (parts.length < 2) continue;
    const name = parts[1].trim();
    if (!name || seen.has(name)) continue;
    names.push(name);
    seen.add(name);
    if (names.length >= limit) break;
  }
  return names;
};

export const loadTopScorerNames = async (limit: number): Promise<string[]> => {
  if (topScorerNamesCache && topScorerNamesCache.length >= limit) {
    return topScorerNamesCache.slice(0, limit);
  }
  let lastError: unknown = null;
  for (const candidate of resolveTopScorersPaths()) {
    try {
      const csv = await fs.promises.readFile(candidate, "utf8");
      const names = parseTopScorerNames(csv, limit);
      topScorerNamesCache = names;
      return names;
    } catch (error) {
      lastError = error;
    }
  }
  console.error(
    `Failed to load top scorers list (tried ${resolveTopScorersPaths().join(", ")}):`,
    lastError,
  );
  topScorerNamesCache = [];
  return [];
};
