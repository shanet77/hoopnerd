import type { PersistedGameKind, PersistedGameRecord } from "@repo/types";
import type { GameStateRepository } from "../repository";

export class InMemoryGameStateRepository implements GameStateRepository {
  private gameStates = new Map<
    string,
    { kind: PersistedGameKind; id: string; state: unknown; updatedAt: Date }
  >();

  async saveGameState(
    kind: PersistedGameKind,
    id: string,
    state: unknown,
  ): Promise<void> {
    this.gameStates.set(`${kind}:${id}`, {
      kind,
      id,
      state,
      updatedAt: new Date(),
    });
  }

  async loadGameStates<T = unknown>(
    kind: PersistedGameKind,
  ): Promise<PersistedGameRecord<T>[]> {
    return Array.from(this.gameStates.values())
      .filter((entry) => entry.kind === kind)
      .map((entry) => ({
        id: entry.id,
        state: entry.state as T,
        updatedAt: entry.updatedAt,
      }));
  }

  async deleteGameState(kind: PersistedGameKind, id: string): Promise<void> {
    this.gameStates.delete(`${kind}:${id}`);
  }
}
