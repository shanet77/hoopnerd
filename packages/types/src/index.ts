import fs from "fs";
import path from "path";
import { Pool } from "pg";

const MONOREPO_TOP_SCORERS_PATH = path.resolve(
  __dirname,
  "../../..",
  "datasets/top_scorers.csv",
);
const DEFAULT_TOP_SCORERS_LIMIT = 80;
let topScorerNamesCache: string[] | null = null;

/**
 * Candidate CSV locations, first hit wins.
 *
 * `__dirname`-relative works in the monorepo (packages/types/dist -> repo
 * root). `pnpm --filter=api deploy` flattens node_modules, so in prod the
 * relative path resolves to /app/node_modules/datasets/... while the
 * datasets volume is mounted at /app/datasets. Probe the deploy mount and
 * cwd as well; TOP_SCORERS_CSV_PATH always wins when set.
 */
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
    if (line.toLowerCase().startsWith("rank,")) {
      continue;
    }

    const parts = line.split(",");
    if (parts.length < 2) {
      continue;
    }

    const name = parts[1].trim();
    if (!name || seen.has(name)) {
      continue;
    }

    names.push(name);
    seen.add(name);

    if (names.length >= limit) {
      break;
    }
  }

  return names;
};

const loadTopScorerNames = async (limit: number): Promise<string[]> => {
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

export type DatabaseService = Pool;

export interface User {
  id: string;
  username: string;
  friendIds: string[];
}

export interface FriendRelationship {
  userId: string;
  friendId: string;
  createdAt: Date;
}

export type CpuDifficulty = "easy";

export interface Player {
  id: number;
  name: string;
  position: string;
  socketId?: string;
  isCpu?: boolean;
}

// WebSocket Event Types
export interface PlayerMove {
  playerId: number;
  playerName: string;
  position: string;
}

export interface PlayerConnection {
  fromPlayer: Player;
  toPlayer: Player;
  seasonYear?: number;
  teamName?: string;
}

export interface GameRoomState {
  roomId: string;
  players: Player[];
  moves: PlayerMove[];
  currentPlayerIndex: number;
  gameStarted: boolean;
  gameCompleted: boolean;
  winner?: Player | null;
  startingPlayer?: Player | null;
  connections: PlayerConnection[];
  lastConnectedPlayer?: Player | null;
  friendsOnly: boolean;
  statsRecorded?: boolean;
  seasonYearMin?: number;
  seasonYearMax?: number;
}

export interface JoinRoomRequest {
  roomId: string;
  playerName: string;
  playerToken?: string;
}

export interface JoinRoomResponse {
  success: boolean;
  message: string;
  roomState?: GameRoomState;
  playerToken?: string;
  playerId?: number;
}

export interface SubmitMoveRequest {
  roomId: string;
  connectedPlayer: Player;
  playerToken: string;
}

export interface SubmitMoveResponse {
  success: boolean;
  message: string;
  roomState?: GameRoomState;
  validated: boolean;
}

export interface CreateRoomResponse {
  success: boolean;
  message: string;
  roomId: string;
}

export interface JoinMatchmakingRequest {
  playerName: string;
  friendsOnly?: boolean;
}

export interface JoinMatchmakingResponse {
  success: boolean;
  message: string;
  roomId?: string;
  roomState?: GameRoomState;
  joinedExisting: boolean;
  playerToken?: string;
  playerId?: number;
}

export interface CreateCpuGameRequest {
  playerName: string;
  difficulty: CpuDifficulty;
  seasonYearMin?: number;
  seasonYearMax?: number;
}

export interface CreateCpuGameResponse {
  success: boolean;
  message: string;
  roomId?: string;
  roomState?: GameRoomState;
  playerToken?: string;
  playerId?: number;
}

export interface LeaveRoomRequest {
  roomId: string;
  playerToken: string;
}

export interface WebSocketEvents {
  // Client to Server events
  join_room: (data: JoinRoomRequest) => void;
  join_matchmaking: (data: JoinMatchmakingRequest) => void;
  create_room: (friendsOnly?: boolean) => void;
  create_cpu_game: (data: CreateCpuGameRequest) => void;
  leave_room: (data: LeaveRoomRequest) => void;
  submit_move: (data: SubmitMoveRequest) => void;

  // Server to Client events
  room_joined: (data: JoinRoomResponse) => void;
  matchmaking_result: (data: JoinMatchmakingResponse) => void;
  room_created: (data: CreateRoomResponse) => void;
  cpu_game_created: (data: CreateCpuGameResponse) => void;
  move_submitted: (data: SubmitMoveResponse) => void;
  player_connected: (player: Player) => void;
  player_disconnected: (playerName: string) => void;
  game_error: (error: string) => void;
  room_updated: (roomState: GameRoomState) => void;
  game_started: (state: GameRoomState) => void;
  turn_changed: (player: Player) => void;
  cpu_thinking: () => void;
  game_over: (data: { winner: Player; reason: string }) => void;
}

export interface PopularItem {
  name: string;
  count: number;
}

export interface PopularSeason {
  seasonYear: number;
  count: number;
}

export interface StatsResponse {
  windowDays: number;
  timezone: string;
  updatedAt: string;
  players: PopularItem[];
  teams: PopularItem[];
  seasons: PopularSeason[];
  longestStreak: number;
}

export class PlayerService {
  constructor(private db: DatabaseService) {}

  async searchPlayers(query: string): Promise<Player[]> {
    const searchTerm = `%${query.trim()}%`;

    const sql = `
      SELECT id, player_name AS name, position
      FROM players
      WHERE player_name ILIKE $1
      ORDER BY player_name
    `;

    const result = await this.db.query(sql, [searchTerm]);
    return result.rows;
  }

  async getRandomPlayer(): Promise<Player | null> {
    const sql = `
      WITH max_id AS (
        SELECT MAX(id) AS max_id
        FROM players
      )
      SELECT id, player_name AS name, position
      FROM players
      WHERE id >= (
        SELECT FLOOR(RANDOM() * max_id) + 1
        FROM max_id
      )
      ORDER BY id
      LIMIT 1
    `;

    const result = await this.db.query(sql);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async getRandomTopScorer(
    limit: number = DEFAULT_TOP_SCORERS_LIMIT,
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<Player | null> {
    const topScorerNames = await loadTopScorerNames(limit);
    const hasSeasonFilter =
      seasonYearMin !== undefined && seasonYearMax !== undefined;

    if (topScorerNames.length > 0) {
      const result = hasSeasonFilter
        ? await this.db.query(
            `
        SELECT id, player_name AS name, position
        FROM players
        WHERE player_name = ANY($1)
          AND id IN (
            SELECT DISTINCT player_id FROM rosters
            WHERE season_year >= $2 AND season_year <= $3
          )
        ORDER BY RANDOM()
        LIMIT 1
      `,
            [topScorerNames, seasonYearMin, seasonYearMax],
          )
        : await this.db.query(
            `
      SELECT id, player_name AS name, position
      FROM players
      WHERE player_name = ANY($1)
      ORDER BY RANDOM()
      LIMIT 1
    `,
            [topScorerNames],
          );
      if (result.rows.length > 0) return result.rows[0];
    }

    // Fallback: the bundled top-scorers CSV is missing (e.g. prod deploy
    // layout) or none of its names match the DB / season filter. Pick any
    // rostered player instead of failing game start outright.
    console.warn(
      "getRandomTopScorer: top-scorers list unavailable or unmatched, falling back to any rostered player",
    );
    const fallback = hasSeasonFilter
      ? await this.db.query(
          `
        SELECT p.id, p.player_name AS name, p.position
        FROM players p
        WHERE p.id IN (
          SELECT DISTINCT player_id FROM rosters
          WHERE season_year >= $1 AND season_year <= $2
        )
        ORDER BY RANDOM()
        LIMIT 1
      `,
          [seasonYearMin, seasonYearMax],
        )
      : await this.db.query(`
        SELECT p.id, p.player_name AS name, p.position
        FROM players p
        WHERE EXISTS (SELECT 1 FROM rosters r WHERE r.player_id = p.id)
        ORDER BY RANDOM()
        LIMIT 1
      `);
    return fallback.rows.length > 0 ? fallback.rows[0] : null;
  }
}

export * from "./testing";
