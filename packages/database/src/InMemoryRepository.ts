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
import { InMemoryPlayersRepository } from "./inMemory/players";
import { InMemoryStatsRepository } from "./inMemory/stats";
import type { StatsEventSeed } from "./inMemory/stats";
import { InMemoryGameStateRepository } from "./inMemory/gameState";
import { InMemorySoloRepository } from "./inMemory/solo";

// ---------------------------------------------------------------------------
// In-memory adapter (test seam — no SQL mocking needed)
// ---------------------------------------------------------------------------
export class InMemoryRepository implements Repository {
  private players = new InMemoryPlayersRepository();
  private stats = new InMemoryStatsRepository();
  private gameStates = new InMemoryGameStateRepository();
  private solo = new InMemorySoloRepository();

  seedPlayers(players: Player[]) {
    this.players.seedPlayers(players);
  }

  seedRoster(
    playerId: number,
    teammateId: number,
    seasonYear: number,
    teamId: number,
    teamName: string,
  ) {
    this.players.seedRoster(playerId, teammateId, seasonYear, teamId, teamName);
  }

  seedStatsEvents(events: StatsEventSeed[]) {
    this.stats.seedStatsEvents(events);
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
