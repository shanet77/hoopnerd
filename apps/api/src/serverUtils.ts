import type { CorsOptions } from "cors";
import { GameRoomState } from "@repo/types";

export const DEFAULT_STATS_WINDOW_DAYS = 7;
export const DEFAULT_STATS_TIMEZONE = "America/New_York";
export const DEFAULT_ALLOWED_ORIGINS = [
  "https://hoopnerd.xyz",
  "https://www.hoopnerd.xyz",
];

export const parseAllowedOrigins = (raw: string | undefined): string[] => {
  if (!raw) return [];
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

export const buildAllowedOrigins = (
  nodeEnv: string | undefined,
  corsOrigin: string | undefined
) => {
  if (nodeEnv !== "production") {
    return ["*"];
  }

  const configured = parseAllowedOrigins(corsOrigin);
  return configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS;
};

export const isOriginAllowed = (
  allowedOrigins: string[],
  origin: string | undefined
) => {
  if (!origin) return true;
  if (allowedOrigins.includes("*")) return true;
  return allowedOrigins.includes(origin);
};

/**
 * Builds CORS options from the resolved allowed origins list.
 */
export const buildCorsConfig = (allowedOrigins: string[]): CorsOptions => ({
  origin: (origin, callback) => {
    if (isOriginAllowed(allowedOrigins, origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "OPTIONS"],
});

export const parseWindowDays = (value: unknown): number => {
  const parsed =
    typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_STATS_WINDOW_DAYS;
  return Math.min(Math.max(parsed, 1), 365);
};

export const parseTimezone = (value: unknown): string => {
  if (typeof value !== "string" || value.trim() === "") {
    return DEFAULT_STATS_TIMEZONE;
  }
  return value.trim();
};

export const createGameRoom = (
  roomId: string,
  friendsOnly: boolean = false
): GameRoomState => ({
  roomId,
  players: [],
  moves: [],
  currentPlayerIndex: 0,
  gameStarted: false,
  gameCompleted: false,
  winner: null,
  startingPlayer: null,
  connections: [],
  lastConnectedPlayer: null,
  friendsOnly,
  statsRecorded: false,
});

export const hasPlayerBeenUsed = (room: GameRoomState, playerId: number) => {
  if (room.startingPlayer?.id === playerId) {
    return true;
  }
  return room.moves.some((move) => move.playerId === playerId);
};
