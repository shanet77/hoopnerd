import { DatabaseService, Player, PlayerConnection } from "@repo/types";

export { CpuEngine } from "./cpuEngine";
export type { CpuEngineDependencies } from "./cpuEngine";

/**
 * Validates a move in the game.
 * If only playerAId is provided, it's considered the first move and validates if the player exists.
 * If playerBId is also provided, it validates if the two players ever played together on the same team in the same season.
 *
 * @param db - Database service instance
 * @param playerAId - ID of the first player
 * @param playerBId - ID of the second player (optional)
 * @returns boolean indicating if the move is valid
 */
export async function validateMove(
  db: DatabaseService,
  playerAId: number,
  playerBId?: number,
): Promise<boolean> {
  // If playerBId is not provided, this is the first move.
  // Validate that playerA exists.
  if (playerBId === undefined) {
    const playerCheckQuery = `
      SELECT COUNT(*) as count
      FROM players
      WHERE id = $1
    `;

    const playerCheckResult = await db.query(playerCheckQuery, [playerAId]);

    return parseInt(playerCheckResult.rows[0].count) === 1;
  }

  const playersCheckQuery = `
    SELECT COUNT(*) as count
    FROM players
    WHERE id IN ($1, $2)
  `;

  const playersCheckResult = await db.query(playersCheckQuery, [
    playerAId,
    playerBId,
  ]);

  if (parseInt(playersCheckResult.rows[0].count) < 2) {
    return false;
  }

  // Check if the players shared a team in any season
  const query = `
    SELECT r1.season_year, r1.team_id, t.team_name
    FROM rosters r1
    JOIN rosters r2 ON r1.team_id = r2.team_id AND r1.season_year = r2.season_year
    JOIN teams t ON r1.team_id = t.id
    WHERE r1.player_id = $1 AND r2.player_id = $2
    LIMIT 1
  `;

  const result = await db.query(query, [playerAId, playerBId]);

  return result.rows.length > 0;
}

/**
 * Gets connection details between two players who played together.
 *
 * @param db - Database service instance
 * @param playerAId - ID of the first player
 * @param playerBId - ID of the second player
 * @returns PlayerConnection object or null if no connection exists
 */
export async function getConnectionDetails(
  db: DatabaseService,
  playerAId: number,
  playerBId: number,
): Promise<PlayerConnection | null> {
  const query = `
    SELECT
      p1.id as from_id, p1.player_name as from_name, p1.position as from_position,
      p2.id as to_id, p2.player_name as to_name, p2.position as to_position,
      r1.season_year,
      t.team_name
    FROM rosters r1
    JOIN rosters r2 ON r1.team_id = r2.team_id AND r1.season_year = r2.season_year
    JOIN teams t ON r1.team_id = t.id
    JOIN players p1 ON r1.player_id = p1.id
    JOIN players p2 ON r2.player_id = p2.id
    WHERE r1.player_id = $1 AND r2.player_id = $2
    LIMIT 1
  `;

  const result = await db.query(query, [playerAId, playerBId]);

  if (result.rows.length === 0) {
    return null;
  }

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

/**
 * Gets player details by ID.
 *
 * @param db - Database service instance
 * @param playerId - ID of the player
 * @returns Player object or null if not found
 */
export async function getPlayerById(
  db: DatabaseService,
  playerId: number,
): Promise<Player | null> {
  const query = `
    SELECT id, player_name AS name, position
    FROM players
    WHERE id = $1
  `;

  const result = await db.query(query, [playerId]);
  return result.rows.length > 0 ? result.rows[0] : null;
}
