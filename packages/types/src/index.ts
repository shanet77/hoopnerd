import { QueryResult } from 'pg';

export interface DatabaseService {
  query(text: string, params?: unknown[]): Promise<QueryResult<any>>;
}

export interface Player {
  id: number;
  name: string;
  position: string;
}

export class PlayerService {
  constructor(private db: DatabaseService) { }

  async searchPlayers(query: string): Promise<Player[]> {
    const searchTerm = `%${query.trim()}%`;

    const sql = `
      SELECT id, player_name AS name, position
      FROM players
      WHERE player_name ILIKE $1
      ORDER BY player_name
      LIMIT 5
    `;

    const result = await this.db.query(sql, [searchTerm]);
    return result.rows;
  }
}
