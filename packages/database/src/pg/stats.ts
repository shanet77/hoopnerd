import type { Pool } from "pg";
import type { GameRoomState, StatsResponse } from "@repo/types";
import type { StatsRepository } from "../repository";

export class PgStatsRepository implements StatsRepository {
  constructor(private pool: Pool) {}

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
}
