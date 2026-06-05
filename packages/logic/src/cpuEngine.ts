import { DatabaseService, CpuDifficulty, Player } from "@repo/types";

export interface CpuEngineDependencies {
  db: DatabaseService;
}

/**
 * The CPU engine evaluates all valid moves from a given player and picks
 * the best one based on difficulty level:
 *  - Easy: random valid move
 *  - Medium: prefer players with fewer total connections
 *  - Hard: 1-ply lookahead — pick the move that minimizes opponent's unused options
 */
export class CpuEngine {
  constructor(private deps: CpuEngineDependencies) {}

  /**
   * Returns the best player to connect to from the given lastConnectedPlayer.
   * Returns null if the CPU has no valid moves (CPU loses).
   *
   * @param lastConnectedPlayer - The player to connect FROM
   * @param usedPlayerIds - IDs already used in this game (including starting player and all moves)
   * @param difficulty - CPU difficulty level
   * @param seasonYearMin - Optional start of season range
   * @param seasonYearMax - Optional end of season range
   * @returns The chosen Player or null
   */
  async getBestMove(
    lastConnectedPlayer: Player,
    usedPlayerIds: number[],
    difficulty: CpuDifficulty,
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<Player | null> {
    // Get all valid candidates (players who shared team+season and not yet used)
    const candidates = await this.getValidCandidates(
      lastConnectedPlayer.id,
      usedPlayerIds,
      seasonYearMin,
      seasonYearMax,
    );

    if (candidates.length === 0) {
      return null;
    }

    switch (difficulty) {
      case "easy":
      default:
        return this.pickRandom(candidates);
    }
  }

  /**
   * Returns all valid players connected to the given player who haven't been used yet.
   */
  async getValidCandidates(
    playerId: number,
    usedPlayerIds: number[],
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<Player[]> {
    const { db } = this.deps;

    const params: (number | number[])[] = [playerId, usedPlayerIds];
    let seasonClause = "";

    if (seasonYearMin !== undefined && seasonYearMax !== undefined) {
      seasonClause = "AND r1.season_year >= $3 AND r1.season_year <= $4";
      params.push(seasonYearMin, seasonYearMax);
    }

    const sql = `
      SELECT DISTINCT p.id, p.player_name AS name, p.position
      FROM rosters r1
      JOIN rosters r2 ON r1.team_id = r2.team_id AND r1.season_year = r2.season_year
      JOIN players p ON r2.player_id = p.id
      WHERE r1.player_id = $1
        AND p.id != ALL($2::int[])${seasonClause ? " " + seasonClause : ""}
      ORDER BY p.player_name
    `;

    const result = await db.query(sql, params);
    return result.rows;
  }

  /**
   * Easy: pick a random candidate.
   */
  private pickRandom(candidates: Player[]): Player {
    const index = Math.floor(Math.random() * candidates.length);
    return candidates[index];
  }

  /**
   * Medium: prefer candidates with fewer total connections (harder for opponent).
   * Uses a subquery to count connections per candidate, then sorts ASC.
   */
  private async pickByConnectionCount(candidates: Player[]): Promise<Player> {
    const { db } = this.deps;
    const candidateIds = candidates.map((c) => c.id);

    // Get connection counts for each candidate
    const sql = `
      SELECT p.id, COUNT(DISTINCT teammate_id) AS connection_count
      FROM (
        SELECT r1.player_id AS id, r2.player_id AS teammate_id
        FROM rosters r1
        JOIN rosters r2 ON r1.team_id = r2.team_id AND r1.season_year = r2.season_year
        WHERE r1.player_id != r2.player_id
          AND r1.player_id = ANY($1::int[])
      ) sub
      JOIN players p ON sub.id = p.id
      GROUP BY p.id
      ORDER BY connection_count ASC
    `;

    const result = await db.query(sql, [candidateIds]);

    if (result.rows.length === 0) {
      return this.pickRandom(candidates);
    }

    // Pick the candidate with the fewest connections
    // If multiple have the same min count, pick a random one among them
    const minCount = parseInt(result.rows[0].connection_count, 10);
    const bestCandidates = result.rows.filter(
      (row: any) => parseInt(row.connection_count, 10) === minCount,
    );

    const bestId =
      bestCandidates[Math.floor(Math.random() * bestCandidates.length)].id;
    return candidates.find((c) => c.id === bestId)!;
  }

  /**
   * Hard: 1-ply lookahead. For each candidate, compute how many unused players
   * the opponent could connect to from that candidate. Pick the candidate that
   * minimizes the opponent's options.
   */
  private async pickByLookahead(
    candidates: Player[],
    usedPlayerIds: number[],
  ): Promise<Player> {
    const { db } = this.deps;

    // For each candidate, count how many distinct unused players are connected to them
    const candidateIds = candidates.map((c) => c.id);

    const sql = `
      SELECT p.id AS candidate_id, COUNT(DISTINCT teammate_id) AS opponent_options
      FROM (
        SELECT r1.player_id AS id, r2.player_id AS teammate_id
        FROM rosters r1
        JOIN rosters r2 ON r1.team_id = r2.team_id AND r1.season_year = r2.season_year
        WHERE r1.player_id != r2.player_id
          AND r1.player_id = ANY($1::int[])
          AND r2.player_id != ALL($2::int[])
      ) sub
      JOIN players p ON sub.id = p.id
      GROUP BY p.id
      ORDER BY opponent_options ASC
    `;

    const result = await db.query(sql, [candidateIds, usedPlayerIds]);

    if (result.rows.length === 0) {
      return this.pickRandom(candidates);
    }

    // Pick the candidate that gives the opponent the fewest options
    const minOptions = parseInt(result.rows[0].opponent_options, 10);
    const bestCandidates = result.rows.filter(
      (row: any) => parseInt(row.opponent_options, 10) === minOptions,
    );

    const bestId =
      bestCandidates[Math.floor(Math.random() * bestCandidates.length)]
        .candidate_id;
    return candidates.find((c) => c.id === bestId)!;
  }
}
