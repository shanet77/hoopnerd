import type { PersistedGameRecord, PersistedSoloGame } from "@repo/types";
import type { GameStateRepository } from "@repo/database";
import { SnapshotQueue } from "../persistence/SnapshotQueue";
import type { SoloRunEntry } from "./events";

export interface SoloRestorePolicy {
  idleTtlMs: number;
  now?: number;
}

export type SoloRestoreHandler = (
  runId: string,
  snapshot: PersistedSoloGame,
) => void;

export function isSoloSnapshotRestorable(
  record: Pick<PersistedGameRecord<PersistedSoloGame>, "state" | "updatedAt">,
  policy: SoloRestorePolicy,
): boolean {
  const snapshot = record.state;
  const run = snapshot?.run;
  if (!snapshot || snapshot.version !== 1 || !run || !snapshot.startedAt) {
    return false;
  }
  if (run.gameCompleted) return false;

  const now = policy.now ?? Date.now();
  return now - snapshot.lastActivityAt <= policy.idleTtlMs;
}

export class SoloPersistence {
  private readonly queue = new SnapshotQueue("SoloEngine", "run");

  constructor(
    private readonly gameStates: GameStateRepository,
    private readonly getEntry: (runId: string) => SoloRunEntry | undefined,
  ) {}

  async restore(
    policy: SoloRestorePolicy,
    onRestore: SoloRestoreHandler,
  ): Promise<void> {
    let records;
    try {
      records =
        await this.gameStates.loadGameStates<PersistedSoloGame>("solo");
    } catch (error) {
      console.error("[SoloEngine] Failed to load persisted runs:", error);
      return;
    }

    for (const record of records) {
      if (!isSoloSnapshotRestorable(record, policy)) {
        await this.gameStates.deleteGameState("solo", record.id);
        continue;
      }
      onRestore(record.id, record.state);
    }
  }

  saveRun(runId: string): Promise<void> {
    const entry = this.getEntry(runId);
    if (!entry) {
      return this.deleteRun(runId);
    }

    const snapshot: PersistedSoloGame = {
      version: 1,
      run: entry.run,
      startedAt: entry.startedAt.toISOString(),
      lastActivityAt: entry.lastActivityAt,
      endRecorded: entry.endRecorded,
    };

    return this.queue.run(runId, () =>
      this.gameStates.saveGameState("solo", runId, snapshot),
    );
  }

  deleteRun(runId: string): Promise<void> {
    return this.queue.run(runId, () =>
      this.gameStates.deleteGameState("solo", runId),
    );
  }
}
