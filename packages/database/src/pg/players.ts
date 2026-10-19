import type { Pool } from "pg";
import type { Player, PlayerConnection } from "@repo/types";
import type { PlayersRepository } from "../repository";
import { DEFAULT_TOP_SCORERS_LIMIT, loadTopScorerNames } from "../topScorers";

export class PgPlayersRepository implements PlayersRepository {
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
}
