import type {
  CpuDifficulty,
  GameRoomState,
  PersistedGameRecord,
  PersistedMatchGame,
} from "@repo/types";
import type { GameStateRepository } from "@repo/database";
import { SnapshotQueue } from "../persistence/SnapshotQueue";

export interface SnapshotRestorePolicy {
  lobbyTtlMs: number;
  hasCpuEngine: boolean;
  now?: number;
}

export type RestoreHandler = (
  roomId: string,
  snapshot: PersistedMatchGame,
  updatedAt: Date,
) => void;

export function isSnapshotRestorable(
  record: Pick<PersistedGameRecord<PersistedMatchGame>, "state" | "updatedAt">,
  policy: SnapshotRestorePolicy,
): boolean {
  const snapshot = record.state;
  const room = snapshot?.room;
  if (!snapshot || snapshot.version !== 1 || !room) return false;
  if (room.gameCompleted) return false;
  if (room.gameStarted && room.players.length < 2) return false;
  if (snapshot.cpuDifficulty && !policy.hasCpuEngine) return false;

  const now = policy.now ?? Date.now();
  if (
    !room.gameStarted &&
    now - record.updatedAt.getTime() > policy.lobbyTtlMs
  ) {
    return false;
  }

  return true;
}

export class MatchPersistence {
  private readonly queue = new SnapshotQueue("MatchEngine", "room");

  constructor(private gameStates: GameStateRepository) {}

  async restore(
    policy: SnapshotRestorePolicy,
    onRestore: RestoreHandler,
  ): Promise<void> {
    let records;
    try {
      records =
        await this.gameStates.loadGameStates<PersistedMatchGame>("match");
    } catch (error) {
      console.error("[MatchEngine] Failed to load persisted rooms:", error);
      return;
    }

    for (const record of records) {
      if (!isSnapshotRestorable(record, policy)) {
        await this.gameStates.deleteGameState("match", record.id);
        continue;
      }
      onRestore(record.id, record.state, record.updatedAt);
    }
  }

  save(
    roomId: string,
    room: GameRoomState,
    cpuDifficulty?: CpuDifficulty,
  ): Promise<void> {
    const snapshot: PersistedMatchGame = {
      version: 1,
      room,
      ...(cpuDifficulty ? { cpuDifficulty } : {}),
    };

    return this.queue.run(roomId, () =>
      this.gameStates.saveGameState("match", roomId, snapshot),
    );
  }

  delete(roomId: string): Promise<void> {
    return this.queue.run(roomId, () =>
      this.gameStates.deleteGameState("match", roomId),
    );
  }
}
