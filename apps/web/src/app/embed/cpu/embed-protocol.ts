/**
 * Pure helpers for the `/embed/cpu` route (framed CPU game).
 *
 * Everything here is intentionally side-effect free (except
 * `postGameOverToParent`, which is a thin window wrapper) so the
 * validation logic can be unit tested and mirrored by embed hosts.
 */

export const EMBED_READY_TYPE = "hoopnerd:ready";
export const EMBED_GAME_OVER_TYPE = "hoopnerd:game-over";

/** Mirrors MAX_PLAYER_NAME_LENGTH in apps/api/src/socketAuth.ts. */
export const MAX_EMBED_NAME_LENGTH = 32;

export interface EmbedSeasonRange {
  min?: number;
  max?: number;
}

export interface GameOverPayload {
  type: typeof EMBED_GAME_OVER_TYPE;
  winnerName: string;
  humanWon: boolean;
  moves: number;
  reason: string;
}

const FALLBACK_PARENT_ORIGINS = [
  "https://www.example.com",
  "https://example.com",
];

/**
 * Normalizes a `?name=` query value the same way the API normalizes
 * player names (trim + collapse whitespace). Falls back to a random
 * guest handle when the value is missing or exceeds the server limit.
 */
export function resolveEmbedPlayerName(raw: string | null | undefined): string {
  const normalized = (raw ?? "").trim().replace(/\s+/g, " ");
  if (normalized.length > 0 && normalized.length <= MAX_EMBED_NAME_LENGTH) {
    return normalized;
  }
  return `Guest-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function toInt(value: string | null | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Validates `?min=`/`?max=` season filters against the seasons the API
 * actually has. Returns `{}` (All Time) when either bound is missing or
 * the clamped range is empty.
 */
export function resolveEmbedSeasonParams(
  rawMin: string | null | undefined,
  rawMax: string | null | undefined,
  minYear?: number,
  maxYear?: number,
): EmbedSeasonRange {
  let min = toInt(rawMin);
  let max = toInt(rawMax);
  if (min === undefined || max === undefined) return {};
  if (minYear !== undefined) min = Math.max(min, minYear);
  if (maxYear !== undefined) max = Math.min(max, maxYear);
  if (min > max) return {};
  return { min, max };
}

export function buildGameOverPayload(args: {
  winnerName: string;
  humanWon: boolean;
  moves: number;
  reason: string;
}): GameOverPayload {
  return {
    type: EMBED_GAME_OVER_TYPE,
    winnerName: args.winnerName,
    humanWon: args.humanWon,
    moves: Math.max(0, Math.trunc(args.moves)),
    reason: args.reason,
  };
}

/**
 * Parent origins allowed to receive game-over messages. Defaults to the
 * personal site; override with NEXT_PUBLIC_EMBED_PARENT_ORIGINS
 * (comma-separated) if the embed is ever framed elsewhere.
 *
 * When framed, the framing page's origin (from document.referrer) is
 * always included: it is precisely the intended recipient, and this
 * keeps local dev working even if the env override is forgotten.
 */
export function getEmbedParentOrigins(): string[] {
  const raw = process.env.NEXT_PUBLIC_EMBED_PARENT_ORIGINS ?? "";
  const list = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origins = list.length > 0 ? list : [...FALLBACK_PARENT_ORIGINS];
  const framer = getFramerOrigin();
  if (framer && !origins.includes(framer)) {
    origins.push(framer);
  }
  return origins;
}

/**
 * The origin of the page framing this embed, or null when top-level or
 * when the browser withheld the referrer. postMessage delivery to a
 * non-matching targetOrigin fails silently, so addressing the actual
 * framer avoids a loader that spins forever with no error.
 */
function getFramerOrigin(): string | null {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }
  if (window.parent === window) return null;
  const referrer = document.referrer;
  if (!referrer) return null;
  try {
    return new URL(referrer).origin;
  } catch {
    return null;
  }
}

/**
 * Notifies the framing page that a game finished. No inbound messages
 * are accepted, so there is nothing for a malicious framer to spoof —
 * hosts must still verify `event.origin` on receipt.
 */
export function postGameOverToParent(payload: GameOverPayload): void {
  if (typeof window === "undefined") return;
  if (window.parent === window) return;
  for (const origin of getEmbedParentOrigins()) {
    try {
      window.parent.postMessage(payload, origin);
    } catch {
      // Ignore unreachable / disallowed targets.
    }
  }
}

/** One-way ready ping so hosts can hide their loading state. */
export function postReadyToParent(): void {
  if (typeof window === "undefined") return;
  if (window.parent === window) return;
  for (const origin of getEmbedParentOrigins()) {
    try {
      window.parent.postMessage({ type: EMBED_READY_TYPE }, origin);
    } catch {
      // Ignore unreachable / disallowed targets.
    }
  }
}
