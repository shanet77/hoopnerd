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
import type {
  Repository,
  SoloRunRecord,
  SoloRunRecordResult,
} from "./repository";

// ---------------------------------------------------------------------------
// In-memory adapter (test seam — no SQL mocking needed)
// ---------------------------------------------------------------------------
export class InMemoryRepository implements Repository {
  private players: Map<number, Player> = new Map();
  private rosters: Array<{
    playerId: number;
    teammateId: number;
    seasonYear: number;
    teamId: number;
    teamName: string;
  }> = [];
  private statsEvents: Array<{
    eventType: string;
    playerName: string | null;
    teamName: string | null;
    seasonYear: number | null;
    streakCount: number | null;
    createdAt: Date;
  }> = [];
  private soloRuns: Array<{
    userId: string;
    displayName: string;
    streakCount: number;
    endReason: SoloEndReason;
    startedAt: Date;
    endedAt: Date;
  }> = [];
  private soloBests = new Map<string, number>();
  private gameStates = new Map<
    string,
    { kind: PersistedGameKind; id: string; state: unknown; updatedAt: Date }
  >();

  seedPlayers(players: Player[]) {
    for (const p of players) this.players.set(p.id, p);
  }

  seedRoster(
    playerId: number,
    teammateId: number,
    seasonYear: number,
    teamId: number,
    teamName: string,
  ) {
    this.rosters.push({
      playerId,
      teammateId,
      seasonYear,
      teamId,
      teamName,
    });
  }

  seedStatsEvents(
    events: Array<{
      eventType: string;
      playerName?: string;
      teamName?: string;
      seasonYear?: number;
      streakCount?: number;
    }>,
  ) {
    for (const e of events) {
      this.statsEvents.push({
        eventType: e.eventType,
        playerName: e.playerName ?? null,
        teamName: e.teamName ?? null,
        seasonYear: e.seasonYear ?? null,
        streakCount: e.streakCount ?? null,
        createdAt: new Date(),
      });
    }
  }

  async searchPlayers(query: string): Promise<Player[]> {
    const q = query.trim().toLowerCase();
    return Array.from(this.players.values())
      .filter((p) => p.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({
        ...p,
        seasons: Array.from(
          new Set(
            this.rosters
              .filter((r) => r.playerId === p.id)
              .map((r) => r.seasonYear),
          ),
        ),
      }));
  }

  async getRandomPlayer(): Promise<Player | null> {
    const all = Array.from(this.players.values());
    return all.length > 0 ? all[Math.floor(Math.random() * all.length)] : null;
  }

  async getRandomTopScorer(
    _limit?: number,
    _seasonYearMin?: number,
    _seasonYearMax?: number,
  ): Promise<Player | null> {
    if (_seasonYearMin === undefined || _seasonYearMax === undefined) {
      return this.getRandomPlayer();
    }
    const rostered = Array.from(this.players.values()).filter((p) =>
      this.rosters.some(
        (r) =>
          r.playerId === p.id &&
          r.seasonYear >= _seasonYearMin! &&
          r.seasonYear <= _seasonYearMax!,
      ),
    );
    return rostered.length > 0
      ? rostered[Math.floor(Math.random() * rostered.length)]
      : null;
  }

  async getPlayerById(id: number): Promise<Player | null> {
    return this.players.get(id) ?? null;
  }

  async validateMove(
    playerAId: number,
    playerBId: number,
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<boolean> {
    return this.rosters.some(
      (r) =>
        r.playerId === playerAId &&
        r.teammateId === playerBId &&
        (seasonYearMin === undefined ||
          seasonYearMax === undefined ||
          (r.seasonYear >= seasonYearMin && r.seasonYear <= seasonYearMax)),
    );
  }

  async getConnectionDetails(
    playerAId: number,
    playerBId: number,
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<PlayerConnection | null> {
    const match = this.rosters.find(
      (r) =>
        r.playerId === playerAId &&
        r.teammateId === playerBId &&
        (seasonYearMin === undefined ||
          seasonYearMax === undefined ||
          (r.seasonYear >= seasonYearMin && r.seasonYear <= seasonYearMax)),
    );
    if (!match) return null;
    const from = this.players.get(match.playerId);
    const to = this.players.get(match.teammateId);
    if (!from || !to) return null;
    return {
      fromPlayer: { id: from.id, name: from.name, position: from.position },
      toPlayer: { id: to.id, name: to.name, position: to.position },
      seasonYear: match.seasonYear,
      teamName: match.teamName,
    };
  }

  async getValidCandidates(
    playerId: number,
    usedPlayerIds: number[],
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<Player[]> {
    const used = new Set(usedPlayerIds);
    const teammateIds = new Set<number>();
    for (const r of this.rosters) {
      if (
        r.playerId === playerId &&
        !used.has(r.teammateId) &&
        (seasonYearMin === undefined ||
          seasonYearMax === undefined ||
          (r.seasonYear >= seasonYearMin && r.seasonYear <= seasonYearMax))
      ) {
        teammateIds.add(r.teammateId);
      }
    }
    return Array.from(teammateIds)
      .map((id) => this.players.get(id))
      .filter((p): p is Player => p !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async hasAnyValidMove(
    playerId: number,
    usedPlayerIds: number[],
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<boolean> {
    const candidates = await this.getValidCandidates(
      playerId,
      usedPlayerIds,
      seasonYearMin,
      seasonYearMax,
    );
    return candidates.length > 0;
  }

  async getSeasons(): Promise<number[]> {
    const years = new Set(this.rosters.map((r) => r.seasonYear));
    return Array.from(years).sort((a, b) => b - a);
  }

  async getStats(windowDays: number, timezone: string): Promise<StatsResponse> {
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const recent = this.statsEvents.filter((e) => e.createdAt >= cutoff);

    const count = <T>(
      items: T[],
      key: (item: T) => string | null | undefined,
    ) => {
      const map = new Map<string, number>();
      for (const item of items) {
        const k = key(item);
        if (k) map.set(k, (map.get(k) || 0) + 1);
      }
      return Array.from(map.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, 5);
    };

    return {
      windowDays,
      timezone,
      updatedAt: new Date().toISOString(),
      players: count(recent, (e) =>
        e.eventType === "player" ? e.playerName : null,
      ),
      teams: count(recent, (e) => (e.eventType === "team" ? e.teamName : null)),
      seasons: count(recent, (e) =>
        e.eventType === "season" ? String(e.seasonYear) : null,
      ).map((s) => ({ seasonYear: Number(s.name), count: s.count })),
      longestStreak: Math.max(
        0,
        ...recent
          .filter((e) => e.eventType === "streak")
          .map((e) => e.streakCount ?? 0),
      ),
    };
  }

  async recordGameStats(room: GameRoomState): Promise<void> {
    if (room.statsRecorded) return;
    room.statsRecorded = true;

    const events: Array<{
      eventType: string;
      playerName?: string;
      teamName?: string;
      seasonYear?: number;
      streakCount?: number;
    }> = [];

    for (const move of room.moves) {
      events.push({ eventType: "player", playerName: move.playerName });
    }
    for (const connection of room.connections) {
      if (connection.teamName) {
        events.push({ eventType: "team", teamName: connection.teamName });
      }
      if (connection.seasonYear) {
        events.push({
          eventType: "season",
          seasonYear: connection.seasonYear,
        });
      }
    }
    events.push({ eventType: "streak", streakCount: room.connections.length });

    for (const e of events) {
      this.statsEvents.push({
        eventType: e.eventType,
        playerName: e.playerName ?? null,
        teamName: e.teamName ?? null,
        seasonYear: e.seasonYear ?? null,
        streakCount: e.streakCount ?? null,
        createdAt: new Date(),
      });
    }
  }

  async saveGameState(
    kind: PersistedGameKind,
    id: string,
    state: unknown,
  ): Promise<void> {
    this.gameStates.set(`${kind}:${id}`, {
      kind,
      id,
      state,
      updatedAt: new Date(),
    });
  }

  async loadGameStates<T = unknown>(
    kind: PersistedGameKind,
  ): Promise<PersistedGameRecord<T>[]> {
    return Array.from(this.gameStates.values())
      .filter((entry) => entry.kind === kind)
      .map((entry) => ({
        id: entry.id,
        state: entry.state as T,
        updatedAt: entry.updatedAt,
      }));
  }

  async deleteGameState(kind: PersistedGameKind, id: string): Promise<void> {
    this.gameStates.delete(`${kind}:${id}`);
  }

  async recordSoloRun(run: SoloRunRecord): Promise<SoloRunRecordResult> {
    this.soloRuns.push({
      userId: run.userId,
      displayName: run.displayName,
      streakCount: run.streakCount,
      endReason: run.endReason,
      startedAt: run.startedAt,
      endedAt: new Date(),
    });
    const previous = this.soloBests.get(run.userId);
    const bestStreak =
      previous === undefined
        ? run.streakCount
        : Math.max(previous, run.streakCount);
    this.soloBests.set(run.userId, bestStreak);
    return {
      bestStreak,
      isNewBest: previous === undefined || run.streakCount > previous,
    };
  }

  async getSoloLeaderboard(
    windowDays: number,
    _timezone: string,
    limit: number,
  ): Promise<SoloLeaderboardEntry[]> {
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const best = new Map<string, SoloLeaderboardEntry>();
    for (const run of this.soloRuns) {
      if (run.endedAt < cutoff) continue;
      const current = best.get(run.userId);
      if (!current || run.streakCount > current.streak) {
        best.set(run.userId, {
          userId: run.userId,
          name: run.displayName,
          streak: run.streakCount,
        });
      }
    }
    return Array.from(best.values())
      .sort((a, b) => b.streak - a.streak || a.name.localeCompare(b.name))
      .slice(0, limit);
  }

  async getSoloBest(userId: string): Promise<number> {
    return this.soloBests.get(userId) ?? 0;
  }
}
