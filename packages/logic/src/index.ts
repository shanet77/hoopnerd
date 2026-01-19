import { DatabaseService } from '@repo/types';

/**
 * Validates if two players ever played together on the same team in the same season.
 *
 * @param db - Database service instance
 * @param playerAId - ID of the first player
 * @param playerBId - ID of the second player
 * @returns boolean indicating if the players ever played together
 */
export async function validateMove(
  db: DatabaseService,
  playerAId: number,
  playerBId: number
): Promise<boolean> {

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
