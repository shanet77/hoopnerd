import { GameRoomState } from "@repo/types";
import databasePool from "@repo/database";

export async function recordGameStats(room: GameRoomState): Promise<void> {
  if (room.statsRecorded) return;
  room.statsRecorded = true;

  const rows: Array<[string, string | null, string | null, number | null, number | null]> = [];

  for (const move of room.moves) {
    rows.push(['player', move.playerName, null, null, null]);
  }

  for (const connection of room.connections) {
    if (connection.teamName) {
      rows.push(['team', null, connection.teamName, null, null]);
    }
    if (connection.seasonYear) {
      rows.push(['season', null, null, connection.seasonYear, null]);
    }
  }

  rows.push(['streak', null, null, null, room.connections.length]);

  if (rows.length === 0) return;

  const placeholders = rows
    .map((_, index) => {
      const offset = index * 5;
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
    })
    .join(', ');

  await databasePool.query(
    `
      INSERT INTO stats_events (event_type, player_name, team_name, season_year, streak_count)
      VALUES ${placeholders}
    `,
    rows.flat()
  );
}
