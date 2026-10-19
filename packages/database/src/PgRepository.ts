import type { Pool } from "pg";
import type {
  Player,
  PlayerConnection,
  GameRoomState,
  StatsResponse,
  SoloLeaderboardEntry,
  PersistedGameKind,
  PersistedGameRecord,
} from "@repo/types";
import type {
  Repository,
  SoloRunRecord,
  SoloRunRecordResult,
} from "./repository";
import { PgPlayersRepository } from "./pg/players";
import { PgStatsRepository } from "./pg/stats";
import { PgGameStateRepository } from "./pg/gameState";
import { PgSoloRepository } from "./pg/solo";

// ---------------------------------------------------------------------------
// PostgreSQL adapter — composition root for the per-domain repositories
// ---------------------------------------------------------------------------
export class PgRepository implements Repository {
  private players: PgPlayersRepository;
  private stats: PgStatsRepository;
  private gameStates: PgGameStateRepository;
  private solo: PgSoloRepository;

  constructor(pool: Pool) {
    this.players = new PgPlayersRepository(pool);
    this.stats = new PgStatsRepository(pool);
    this.gameStates = new PgGameStateRepository(pool);
    this.solo = new PgSoloRepository(pool);
  }

  searchPlayers(query: string): Promise<Player[]> {
    return this.players.searchPlayers(query);
  }

  getRandomPlayer(): Promise<Player | null> {
    return this.players.getRandomPlayer();
  }

  getRandomTopScorer(
    limit?: number,
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<Player | null> {
    return this.players.getRandomTopScorer(limit, seasonYearMin, seasonYearMax);
  }

  getPlayerById(id: number): Promise<Player | null> {
    return this.players.getPlayerById(id);
  }

  validateMove(
    playerAId: number,
    playerBId: number,
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<boolean> {
    return this.players.validateMove(
      playerAId,
      playerBId,
      seasonYearMin,
      seasonYearMax,
    );
  }

  getConnectionDetails(
    playerAId: number,
    playerBId: number,
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<PlayerConnection | null> {
    return this.players.getConnectionDetails(
      playerAId,
      playerBId,
      seasonYearMin,
      seasonYearMax,
    );
  }

  getValidCandidates(
    playerId: number,
    usedPlayerIds: number[],
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<Player[]> {
    return this.players.getValidCandidates(
      playerId,
      usedPlayerIds,
      seasonYearMin,
      seasonYearMax,
    );
  }

  hasAnyValidMove(
    playerId: number,
    usedPlayerIds: number[],
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<boolean> {
    return this.players.hasAnyValidMove(
      playerId,
      usedPlayerIds,
      seasonYearMin,
      seasonYearMax,
    );
  }

  getSeasons(): Promise<number[]> {
    return this.players.getSeasons();
  }

  getStats(windowDays: number, timezone: string): Promise<StatsResponse> {
    return this.stats.getStats(windowDays, timezone);
  }

  recordGameStats(room: GameRoomState): Promise<void> {
    return this.stats.recordGameStats(room);
  }

  saveGameState(
    kind: PersistedGameKind,
    id: string,
    state: unknown,
  ): Promise<void> {
    return this.gameStates.saveGameState(kind, id, state);
  }

  loadGameStates<T = unknown>(
    kind: PersistedGameKind,
  ): Promise<PersistedGameRecord<T>[]> {
    return this.gameStates.loadGameStates<T>(kind);
  }

  deleteGameState(kind: PersistedGameKind, id: string): Promise<void> {
    return this.gameStates.deleteGameState(kind, id);
  }

  recordSoloRun(run: SoloRunRecord): Promise<SoloRunRecordResult> {
    return this.solo.recordSoloRun(run);
  }

  getSoloLeaderboard(
    windowDays: number,
    timezone: string,
    limit: number,
  ): Promise<SoloLeaderboardEntry[]> {
    return this.solo.getSoloLeaderboard(windowDays, timezone, limit);
  }

  getSoloBest(userId: string): Promise<number> {
    return this.solo.getSoloBest(userId);
  }
}
