import type { Pool } from "pg";
import type { SoloLeaderboardEntry } from "@repo/types";
import type {
  SoloRepository,
  SoloRunRecord,
  SoloRunRecordResult,
} from "../repository";

export class PgSoloRepository implements SoloRepository {
  constructor(private pool: Pool) {}

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
