import type {
  PersistedSoloGame,
  Player,
  SoloEndReason,
  SoloRunState,
} from "@repo/types";
import type { Repository } from "@repo/database";
import { hasPlayerBeenUsed } from "../serverUtils";

export interface SoloMoveOutcome {
  success: boolean;
  message: string;
  move?: SoloRunState["moves"][number];
  connection?: SoloRunState["connections"][number] | null;
  streak?: number;
  ended?: boolean;
  endReason?: SoloEndReason;
  personalBest?: number;
  isNewBest?: boolean;
}

export interface SoloRunOutcome {
  success: boolean;
  message: string;
  streak: number;
  endReason?: SoloEndReason;
  personalBest?: number;
  isNewBest?: boolean;
}

interface SoloRunEntry {
  run: SoloRunState;
  startedAt: Date;
  lastActivityAt: number;
  endRecorded: boolean;
  pending: boolean;
}

export interface SoloEngineDependencies {
  repository: Repository;
  idleTtlMs?: number;
  sweepIntervalMs?: number;
}

const DEFAULT_IDLE_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const STARTING_PLAYER_ATTEMPTS = 5;

export class SoloEngine {
  private runs = new Map<string, SoloRunEntry>();
  private persistQueue = new Map<string, Promise<void>>();
  private readonly idleTtlMs: number;
  private readonly sweeper: NodeJS.Timeout;

  constructor(private deps: SoloEngineDependencies) {
    this.idleTtlMs =
      deps.idleTtlMs ??
      (Number(process.env.SOLO_RUN_IDLE_TTL_MS) || DEFAULT_IDLE_TTL_MS);
    const sweepIntervalMs = deps.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
    this.sweeper = setInterval(() => this.evictIdleRuns(), sweepIntervalMs);
    this.sweeper.unref();
  }

  async restore(): Promise<void> {
    let records;
    try {
      records =
        await this.deps.repository.loadGameStates<PersistedSoloGame>("solo");
    } catch (error) {
      console.error("[SoloEngine] Failed to load persisted runs:", error);
      return;
    }

    const now = Date.now();
    for (const record of records) {
      const snapshot = record.state;
      const run = snapshot?.run;
      const stale = run
        ? now - snapshot.lastActivityAt > this.idleTtlMs
        : true;

      if (
        !run ||
        run.gameCompleted ||
        stale ||
        snapshot?.version !== 1 ||
        !snapshot.startedAt
      ) {
        await this.deps.repository.deleteGameState("solo", record.id);
        continue;
      }

      this.runs.set(record.id, {
        run,
        startedAt: new Date(snapshot.startedAt),
        lastActivityAt: snapshot.lastActivityAt,
        endRecorded: snapshot.endRecorded,
        pending: false,
      });
    }
  }

  async create(
    userId: string,
    displayName: string,
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<SoloRunState | null> {
    let startingPlayer: Player | null = null;
    for (let i = 0; i < STARTING_PLAYER_ATTEMPTS; i++) {
      const candidate = await this.deps.repository.getRandomTopScorer(
        undefined,
        seasonYearMin,
        seasonYearMax,
      );
      if (!candidate) break;
      const hasMoves = await this.deps.repository.hasAnyValidMove(
        candidate.id,
        [candidate.id],
        seasonYearMin,
        seasonYearMax,
      );
      if (hasMoves) {
        startingPlayer = candidate;
        break;
      }
      startingPlayer = candidate;
    }

    if (!startingPlayer) return null;

    const runId = this.generateRunId();
    const run: SoloRunState = {
      roomId: runId,
      userId,
      displayName,
      players: [],
      moves: [],
      currentPlayerIndex: 0,
      gameStarted: true,
      gameCompleted: false,
      winner: null,
      startingPlayer,
      connections: [],
      lastConnectedPlayer: startingPlayer,
      friendsOnly: false,
      statsRecorded: false,
      endReason: undefined,
      seasonYearMin,
      seasonYearMax,
    };

    this.runs.set(runId, {
      run,
      startedAt: new Date(),
      lastActivityAt: Date.now(),
      endRecorded: false,
      pending: false,
    });

    await this.saveRun(runId);
    return run;
  }

  getRun(runId: string): SoloRunState | undefined {
    return this.runs.get(runId)?.run;
  }

  resumeRun(runId: string): SoloRunState | undefined {
    const entry = this.runs.get(runId);
    if (!entry) return undefined;
    entry.lastActivityAt = Date.now();
    void this.saveRun(runId);
    return entry.run;
  }

  async submitMove(
    runId: string,
    userId: string,
    connectedPlayer: Player,
  ): Promise<SoloMoveOutcome> {
    const entry = this.runs.get(runId);
    if (!entry) {
      return {
        success: false,
        message:
          "Run not found — it may have expired after a long idle period.",
      };
    }
    if (entry.run.userId !== userId) {
      return { success: false, message: "This run belongs to another player." };
    }
    if (entry.run.gameCompleted) {
      return { success: false, message: "This run has already ended." };
    }
    if (entry.pending) {
      return {
        success: false,
        message: "Still processing your previous move.",
      };
    }

    entry.pending = true;
    try {
      entry.lastActivityAt = Date.now();
      const run = entry.run;

      if (hasPlayerBeenUsed(run, connectedPlayer.id)) {
        return await this.endWithOutcome(
          entry,
          "repeat",
          `${connectedPlayer.name} was already used in this chain — run over!`,
          false,
        );
      }

      if (run.lastConnectedPlayer) {
        const isValidMove = await this.deps.repository.validateMove(
          run.lastConnectedPlayer.id,
          connectedPlayer.id,
          run.seasonYearMin,
          run.seasonYearMax,
        );

        if (!isValidMove) {
          return await this.endWithOutcome(
            entry,
            "invalid",
            `${connectedPlayer.name} did not play with ${run.lastConnectedPlayer.name} — run over!`,
            false,
          );
        }

        const connection = await this.deps.repository.getConnectionDetails(
          run.lastConnectedPlayer.id,
          connectedPlayer.id,
          run.seasonYearMin,
          run.seasonYearMax,
        );
        if (connection) {
          run.connections.push(connection);
        }
      }

      const move = {
        playerId: connectedPlayer.id,
        playerName: connectedPlayer.name,
        position: connectedPlayer.position,
      };
      run.moves.push(move);
      run.lastConnectedPlayer = connectedPlayer;
      const streak = run.moves.length;

      const usedPlayerIds = this.collectUsedPlayerIds(run);
      const canContinue = await this.deps.repository.hasAnyValidMove(
        connectedPlayer.id,
        usedPlayerIds,
        run.seasonYearMin,
        run.seasonYearMax,
      );

      if (!canContinue) {
        return await this.endWithOutcome(
          entry,
          "stuck",
          `No players left to connect to ${connectedPlayer.name} — run over!`,
          true,
        );
      }

      await this.saveRun(runId);
      return {
        success: true,
        message: `${connectedPlayer.name} connected! Streak: ${streak}.`,
        move,
        connection: run.connections[run.connections.length - 1] ?? null,
        streak,
      };
    } finally {
      entry.pending = false;
    }
  }

  async endRun(
    runId: string,
    userId: string,
    reason: SoloEndReason = "forfeit",
  ): Promise<SoloRunOutcome> {
    const entry = this.runs.get(runId);
    if (!entry) {
      return {
        success: false,
        message:
          "Run not found — it may have expired after a long idle period.",
        streak: 0,
      };
    }
    if (entry.run.userId !== userId) {
      return {
        success: false,
        message: "This run belongs to another player.",
        streak: 0,
      };
    }

    if (entry.run.gameCompleted) {
      return {
        success: true,
        message: "Run already ended.",
        streak: entry.run.moves.length,
        endReason: entry.run.endReason,
      };
    }

    const outcome = await this.endWithOutcome(
      entry,
      reason,
      "Run ended — streak banked!",
      true,
    );
    return {
      success: true,
      message: outcome.message,
      streak: outcome.streak ?? 0,
      endReason: outcome.endReason,
      personalBest: outcome.personalBest,
      isNewBest: outcome.isNewBest,
    };
  }

  stop(): void {
    clearInterval(this.sweeper);
  }

  private async endWithOutcome(
    entry: SoloRunEntry,
    reason: SoloEndReason,
    message: string,
    moveAccepted: boolean,
  ): Promise<SoloMoveOutcome> {
    const run = entry.run;
    run.gameCompleted = true;
    run.endReason = reason;
    const streak = run.moves.length;

    if (entry.endRecorded) {
      await this.deleteRun(run.roomId);
      return {
        success: moveAccepted,
        message,
        streak,
        ended: true,
        endReason: reason,
      };
    }
    entry.endRecorded = true;

    try {
      const result = await this.deps.repository.recordSoloRun({
        userId: run.userId,
        displayName: run.displayName,
        streakCount: streak,
        endReason: reason,
        startedAt: entry.startedAt,
      });
      await this.deleteRun(run.roomId);
      return {
        success: moveAccepted,
        message,
        streak,
        ended: true,
        endReason: reason,
        personalBest: result.bestStreak,
        isNewBest: result.isNewBest,
      };
    } catch (error) {
      console.error(`[SoloEngine] Failed to record run ${run.roomId}:`, error);
      await this.deleteRun(run.roomId);
      return {
        success: moveAccepted,
        message,
        streak,
        ended: true,
        endReason: reason,
        personalBest: streak,
        isNewBest: false,
      };
    }
  }

  private saveRun(runId: string): Promise<void> {
    const entry = this.runs.get(runId);
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

    return this.queuePersistence(runId, () =>
      this.deps.repository.saveGameState("solo", runId, snapshot),
    );
  }

  private deleteRun(runId: string): Promise<void> {
    return this.queuePersistence(runId, () =>
      this.deps.repository.deleteGameState("solo", runId),
    );
  }

  private queuePersistence(
    runId: string,
    task: () => Promise<void>,
  ): Promise<void> {
    const previous = this.persistQueue.get(runId) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(task)
      .catch((error) => {
        console.error(`[SoloEngine] Failed to persist run ${runId}:`, error);
      });
    const next = run.finally(() => {
      if (this.persistQueue.get(runId) === next) {
        this.persistQueue.delete(runId);
      }
    });
    this.persistQueue.set(runId, next);
    return next;
  }

  private collectUsedPlayerIds(run: SoloRunState): number[] {
    const used = new Set<number>();
    if (run.startingPlayer) used.add(run.startingPlayer.id);
    for (const move of run.moves) used.add(move.playerId);
    return Array.from(used);
  }

  private evictIdleRuns(): void {
    const cutoff = Date.now() - this.idleTtlMs;
    for (const [runId, entry] of this.runs.entries()) {
      if (entry.lastActivityAt < cutoff) {
        this.runs.delete(runId);
        void this.deleteRun(runId);
      }
    }
  }

  private generateRunId(): string {
    let candidate = Math.random().toString(36).substring(2, 8).toUpperCase();
    while (this.runs.has(candidate)) {
      candidate = Math.random().toString(36).substring(2, 8).toUpperCase();
    }
    return candidate;
  }
}
