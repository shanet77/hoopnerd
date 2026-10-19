import { Pool } from "pg";
import fs from "fs";
import path from "path";
import type {
  Player,
  PlayerConnection,
  GameRoomState,
  StatsResponse,
  SoloEndReason,
  SoloLeaderboardEntry,
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

export interface Repository {
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
  getStats(windowDays: number, timezone: string): Promise<StatsResponse>;
  recordGameStats(room: GameRoomState): Promise<void>;
  recordSoloRun(run: SoloRunRecord): Promise<SoloRunRecordResult>;
  getSoloLeaderboard(
    windowDays: number,
    timezone: string,
    limit: number,
  ): Promise<SoloLeaderboardEntry[]>;
  getSoloBest(userId: string): Promise<number>;
}

// ---------------------------------------------------------------------------
// Top-scorers CSV helpers (moved from @repo/types)
// ---------------------------------------------------------------------------
const MONOREPO_TOP_SCORERS_PATH = path.resolve(
  __dirname,
  "../../..",
  "datasets/top_scorers.csv",
);
const DEFAULT_TOP_SCORERS_LIMIT = 80;
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

// ---------------------------------------------------------------------------
// PostgreSQL adapter
// ---------------------------------------------------------------------------
export class PgRepository implements Repository {
  constructor(private pool: Pool) {}

  async searchPlayers(query: string): Promise<Player[]> {
    const sql = `
      SELECT p.id, p.player_name AS name, p.position,
             array_agg(DISTINCT r.season_year) FILTER (WHERE r.season_year IS NOT NULL) AS seasons
      FROM players p
      LEFT JOIN rosters r ON r.player_id = p.id
      WHERE p.player_name ILIKE $1
      GROUP BY p.id, p.player_name, p.position
      ORDER BY p.player_name
    `;
    const result = await this.pool.query(sql, [`%${query.trim()}%`]);
    return result.rows;
  }

  async getRandomPlayer(): Promise<Player | null> {
    const sql = `
      WITH max_id AS (
        SELECT MAX(id) AS max_id FROM players
      )
      SELECT id, player_name AS name, position
      FROM players
      WHERE id >= (SELECT FLOOR(RANDOM() * max_id) + 1 FROM max_id)
      ORDER BY id
      LIMIT 1
    `;
    const result = await this.pool.query(sql);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async getRandomTopScorer(
    limit: number = DEFAULT_TOP_SCORERS_LIMIT,
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<Player | null> {
    const topScorerNames = await loadTopScorerNames(limit);

    if (seasonYearMin !== undefined && seasonYearMax !== undefined) {
      if (topScorerNames.length > 0) {
        const result = await this.pool.query(
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
        );
        if (result.rows.length > 0) return result.rows[0];
      }

      const fallback = await this.pool.query(
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
      );
      return fallback.rows.length > 0 ? fallback.rows[0] : null;
    }

    if (topScorerNames.length > 0) {
      const result = await this.pool.query(
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

    console.warn(
      "getRandomTopScorer: top-scorers list unavailable or unmatched, falling back to any rostered player",
    );
    const fallback = await this.pool.query(`
      SELECT p.id, p.player_name AS name, p.position
      FROM players p
      WHERE EXISTS (SELECT 1 FROM rosters r WHERE r.player_id = p.id)
      ORDER BY RANDOM()
      LIMIT 1
    `);
    return fallback.rows.length > 0 ? fallback.rows[0] : null;
  }

  async getPlayerById(id: number): Promise<Player | null> {
    const result = await this.pool.query(
      `SELECT id, player_name AS name, position FROM players WHERE id = $1`,
      [id],
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async validateMove(
    playerAId: number,
    playerBId: number,
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<boolean> {
    const playersCheck = await this.pool.query(
      `SELECT COUNT(*) as count FROM players WHERE id IN ($1, $2)`,
      [playerAId, playerBId],
    );
    if (parseInt(playersCheck.rows[0].count) < 2) return false;

    if (seasonYearMin !== undefined && seasonYearMax !== undefined) {
      const result = await this.pool.query(
        `
        SELECT 1 FROM rosters r1
        JOIN rosters r2 ON r1.team_id = r2.team_id AND r1.season_year = r2.season_year
        WHERE r1.player_id = $1 AND r2.player_id = $2
          AND r1.season_year >= $3 AND r1.season_year <= $4
        LIMIT 1
      `,
        [playerAId, playerBId, seasonYearMin, seasonYearMax],
      );
      return result.rows.length > 0;
    }

    const result = await this.pool.query(
      `
      SELECT 1 FROM rosters r1
      JOIN rosters r2 ON r1.team_id = r2.team_id AND r1.season_year = r2.season_year
      WHERE r1.player_id = $1 AND r2.player_id = $2
      LIMIT 1
    `,
      [playerAId, playerBId],
    );
    return result.rows.length > 0;
  }

  async getConnectionDetails(
    playerAId: number,
    playerBId: number,
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<PlayerConnection | null> {
    const params: number[] = [playerAId, playerBId];
    let seasonClause = "";
    if (seasonYearMin !== undefined && seasonYearMax !== undefined) {
      seasonClause = "AND r1.season_year >= $3 AND r1.season_year <= $4";
      params.push(seasonYearMin, seasonYearMax);
    }

    const result = await this.pool.query(
      `
      SELECT
        p1.id as from_id, p1.player_name as from_name, p1.position as from_position,
        p2.id as to_id, p2.player_name as to_name, p2.position as to_position,
        r1.season_year, t.team_name
      FROM rosters r1
      JOIN rosters r2 ON r1.team_id = r2.team_id AND r1.season_year = r2.season_year
      JOIN teams t ON r1.team_id = t.id
      JOIN players p1 ON r1.player_id = p1.id
      JOIN players p2 ON r2.player_id = p2.id
      WHERE r1.player_id = $1 AND r2.player_id = $2 ${seasonClause}
      LIMIT 1
    `,
      params,
    );

    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      fromPlayer: {
        id: row.from_id,
        name: row.from_name,
        position: row.from_position,
      },
      toPlayer: {
        id: row.to_id,
        name: row.to_name,
        position: row.to_position,
      },
      seasonYear: row.season_year,
      teamName: row.team_name,
    };
  }

  async getValidCandidates(
    playerId: number,
    usedPlayerIds: number[],
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<Player[]> {
    const params: (number | number[])[] = [playerId, usedPlayerIds];
    let seasonClause = "";
    if (seasonYearMin !== undefined && seasonYearMax !== undefined) {
      seasonClause = "AND r1.season_year >= $3 AND r1.season_year <= $4";
      params.push(seasonYearMin, seasonYearMax);
    }

    const result = await this.pool.query(
      `
      SELECT DISTINCT p.id, p.player_name AS name, p.position
      FROM rosters r1
      JOIN rosters r2 ON r1.team_id = r2.team_id AND r1.season_year = r2.season_year
      JOIN players p ON r2.player_id = p.id
      WHERE r1.player_id = $1
        AND p.id != ALL($2::int[])${seasonClause ? " " + seasonClause : ""}
      ORDER BY p.player_name
    `,
      params,
    );
    return result.rows;
  }

  async hasAnyValidMove(
    playerId: number,
    usedPlayerIds: number[],
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<boolean> {
    const params: (number | number[])[] = [playerId, usedPlayerIds];
    let seasonClause = "";
    if (seasonYearMin !== undefined && seasonYearMax !== undefined) {
      seasonClause = "AND r1.season_year >= $3 AND r1.season_year <= $4";
      params.push(seasonYearMin, seasonYearMax);
    }

    const result = await this.pool.query(
      `
      SELECT EXISTS (
        SELECT 1
        FROM rosters r1
        JOIN rosters r2 ON r1.team_id = r2.team_id AND r1.season_year = r2.season_year
        JOIN players p ON r2.player_id = p.id
        WHERE r1.player_id = $1
          AND p.id != ALL($2::int[])${seasonClause ? " " + seasonClause : ""}
        LIMIT 1
      ) AS has_move
    `,
      params,
    );
    return result.rows[0]?.has_move === true;
  }

  async getSeasons(): Promise<number[]> {
    const result = await this.pool.query(
      `SELECT DISTINCT season_year FROM rosters ORDER BY season_year DESC`,
    );
    return result.rows.map((row: { season_year: number }) => row.season_year);
  }

  async getStats(windowDays: number, timezone: string): Promise<StatsResponse> {
    const timeFilter = `
      created_at AT TIME ZONE $2 >= (NOW() AT TIME ZONE $2) - ($1 || ' days')::interval
    `;

    const playersResult = await this.pool.query(
      `
      SELECT player_name AS name, COUNT(*)::int AS count
      FROM stats_events
      WHERE event_type = 'player' AND ${timeFilter} AND player_name IS NOT NULL
      GROUP BY player_name ORDER BY count DESC, name ASC LIMIT 5
    `,
      [windowDays, timezone],
    );

    const teamsResult = await this.pool.query(
      `
      SELECT team_name AS name, COUNT(*)::int AS count
      FROM stats_events
      WHERE event_type = 'team' AND ${timeFilter} AND team_name IS NOT NULL
      GROUP BY team_name ORDER BY count DESC, name ASC LIMIT 5
    `,
      [windowDays, timezone],
    );

    const seasonsResult = await this.pool.query(
      `
      SELECT season_year AS "seasonYear", COUNT(*)::int AS count
      FROM stats_events
      WHERE event_type = 'season' AND ${timeFilter} AND season_year IS NOT NULL
      GROUP BY season_year ORDER BY count DESC, season_year DESC LIMIT 5
    `,
      [windowDays, timezone],
    );

    const streakResult = await this.pool.query(
      `
      SELECT COALESCE(MAX(streak_count), 0)::int AS longest
      FROM stats_events
      WHERE event_type = 'streak' AND ${timeFilter}
    `,
      [windowDays, timezone],
    );

    return {
      windowDays,
      timezone,
      updatedAt: new Date().toISOString(),
      players: playersResult.rows,
      teams: teamsResult.rows,
      seasons: seasonsResult.rows,
      longestStreak: streakResult.rows[0]?.longest ?? 0,
    };
  }

  async recordGameStats(room: GameRoomState): Promise<void> {
    if (room.statsRecorded) return;
    room.statsRecorded = true;

    const rows: Array<
      [string, string | null, string | null, number | null, number | null]
    > = [];

    for (const move of room.moves) {
      rows.push(["player", move.playerName, null, null, null]);
    }
    for (const connection of room.connections) {
      if (connection.teamName) {
        rows.push(["team", null, connection.teamName, null, null]);
      }
      if (connection.seasonYear) {
        rows.push(["season", null, null, connection.seasonYear, null]);
      }
    }
    rows.push(["streak", null, null, null, room.connections.length]);

    if (rows.length === 0) return;

    const placeholders = rows
      .map((_, i) => {
        const offset = i * 5;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
      })
      .join(", ");

    await this.pool.query(
      `
      INSERT INTO stats_events (event_type, player_name, team_name, season_year, streak_count)
      VALUES ${placeholders}
    `,
      rows.flat(),
    );
  }

  async recordSoloRun(run: SoloRunRecord): Promise<SoloRunRecordResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `
        INSERT INTO solo_runs (user_id, display_name, streak_count, end_reason, started_at, ended_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `,
        [
          run.userId,
          run.displayName,
          run.streakCount,
          run.endReason,
          run.startedAt,
        ],
      );

      const best = await client.query(
        `
        WITH prev AS (
          SELECT best_streak FROM solo_bests WHERE user_id = $1
        ), upsert AS (
          INSERT INTO solo_bests (user_id, display_name, best_streak)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id) DO UPDATE
            SET best_streak = GREATEST(solo_bests.best_streak, EXCLUDED.best_streak),
                display_name = EXCLUDED.display_name,
                updated_at = NOW()
          RETURNING best_streak
        )
        SELECT upsert.best_streak, (SELECT best_streak FROM prev) AS previous FROM upsert
      `,
        [run.userId, run.displayName, run.streakCount],
      );

      await client.query("COMMIT");

      const row = best.rows[0];
      return {
        bestStreak: row.best_streak,
        isNewBest: row.previous === null || row.best_streak > row.previous,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async getSoloLeaderboard(
    windowDays: number,
    timezone: string,
    limit: number,
  ): Promise<SoloLeaderboardEntry[]> {
    const timeFilter = `
      ended_at AT TIME ZONE $1 >= (NOW() AT TIME ZONE $1) - ($2 || ' days')::interval
    `;
    const result = await this.pool.query(
      `
      SELECT user_id AS "userId", display_name AS name, streak
      FROM (
        SELECT DISTINCT ON (user_id) user_id, display_name, streak_count AS streak
        FROM solo_runs
        WHERE ${timeFilter}
        ORDER BY user_id, streak_count DESC, ended_at DESC
      ) best
      ORDER BY streak DESC, name ASC
      LIMIT $3
    `,
      [timezone, windowDays, limit],
    );
    return result.rows;
  }

  async getSoloBest(userId: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT best_streak FROM solo_bests WHERE user_id = $1`,
      [userId],
    );
    return result.rows.length > 0 ? result.rows[0].best_streak : 0;
  }
}

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
