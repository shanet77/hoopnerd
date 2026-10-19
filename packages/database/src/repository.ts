import type {
  Player,
  PlayerConnection,
  GameRoomState,
  StatsResponse,
  SoloEndReason,
  SoloLeaderboardEntry,
  PersistedGameKind,
  PersistedGameRecord,
} from "@repo/types";

export interface SoloRunRecord {
  userId: string;
  displayName: string;
  streakCount: number;
  endReason: SoloEndReason;
  startedAt: Date;
}

export interface SoloRunRecordResult {
  bestStreak: number;
  isNewBest: boolean;
}

export interface PlayersRepository {
  searchPlayers(query: string): Promise<Player[]>;
  getRandomPlayer(): Promise<Player | null>;
  getRandomTopScorer(
    limit?: number,
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<Player | null>;
  getPlayerById(id: number): Promise<Player | null>;
  validateMove(
    playerAId: number,
    playerBId: number,
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<boolean>;
  getConnectionDetails(
    playerAId: number,
    playerBId: number,
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<PlayerConnection | null>;
  getValidCandidates(
    playerId: number,
    usedPlayerIds: number[],
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<Player[]>;
  hasAnyValidMove(
    playerId: number,
    usedPlayerIds: number[],
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<boolean>;
  getSeasons(): Promise<number[]>;
}

export interface GameStateRepository {
  saveGameState(
    kind: PersistedGameKind,
    id: string,
    state: unknown,
  ): Promise<void>;
  loadGameStates<T = unknown>(
    kind: PersistedGameKind,
  ): Promise<PersistedGameRecord<T>[]>;
  deleteGameState(kind: PersistedGameKind, id: string): Promise<void>;
}

export interface StatsRepository {
  getStats(windowDays: number, timezone: string): Promise<StatsResponse>;
  recordGameStats(room: GameRoomState): Promise<void>;
}

export interface SoloRepository {
  recordSoloRun(run: SoloRunRecord): Promise<SoloRunRecordResult>;
  getSoloLeaderboard(
    windowDays: number,
    timezone: string,
    limit: number,
  ): Promise<SoloLeaderboardEntry[]>;
  getSoloBest(userId: string): Promise<number>;
}

export interface Repositories {
  players: PlayersRepository;
  stats: StatsRepository;
  gameStates: GameStateRepository;
  solo: SoloRepository;
}
