import { DatabaseService } from '@repo/types';

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
  playerBId?: number
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

  const playersCheckResult = await db.query(playersCheckQuery, [playerAId, playerBId]);

  if (parseInt(playersCheckResult.rows[0].count) < 2) {
    return false;
  }

  // Check if the players shared a team in any season
  const query = `
    SELECT r1.season_year, r1.team_id
    FROM rosters r1
    JOIN rosters r2 ON r1.team_id = r2.team_id AND r1.season_year = r2.season_year
    WHERE r1.player_id = $1 AND r2.player_id = $2
  `;

  const result = await db.query(query, [playerAId, playerBId]);

  return result.rows.length > 0;
}
