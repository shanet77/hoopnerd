import type { Pool } from "pg";
import type { PersistedGameKind, PersistedGameRecord } from "@repo/types";
import type { GameStateRepository } from "../repository";

export class PgGameStateRepository implements GameStateRepository {
  constructor(private pool: Pool) {}

  async saveGameState(
    kind: PersistedGameKind,
    id: string,
    state: unknown,
  ): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO active_games (id, kind, state, updated_at)
      VALUES ($1, $2, $3::jsonb, NOW())
      ON CONFLICT (id, kind) DO UPDATE
        SET state = EXCLUDED.state,
            updated_at = NOW()
    `,
      [id, kind, JSON.stringify(state)],
    );
  }

  async loadGameStates<T = unknown>(
    kind: PersistedGameKind,
  ): Promise<PersistedGameRecord<T>[]> {
    const result = await this.pool.query(
      `SELECT id, state, updated_at FROM active_games WHERE kind = $1`,
      [kind],
    );
    return result.rows.map((row) => ({
      id: row.id,
      state: row.state as T,
      updatedAt: row.updated_at as Date,
    }));
  }

  async deleteGameState(kind: PersistedGameKind, id: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM active_games WHERE kind = $1 AND id = $2`,
      [kind, id],
    );
  }
}
