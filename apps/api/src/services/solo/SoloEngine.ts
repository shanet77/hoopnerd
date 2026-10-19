import type { Player, SoloEndReason, SoloRunState } from "@repo/types";
import { hasPlayerBeenUsed } from "../../serverUtils";
import { IdleSweeper } from "../persistence/IdleSweeper";
import type {
  SoloEngineDependencies,
  SoloMoveOutcome,
  SoloRunEntry,
  SoloRunOutcome,
} from "./events";
import { SoloPersistence } from "./SoloPersistence";
import { SoloRunLifecycle } from "./SoloRunLifecycle";

export type {
  SoloEngineDependencies,
  SoloMoveOutcome,
  SoloRunOutcome,
} from "./events";

const DEFAULT_IDLE_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export class SoloEngine {
  private readonly runs = new Map<string, SoloRunEntry>();
  private readonly persistence: SoloPersistence;
  private readonly lifecycle: SoloRunLifecycle;
  private readonly sweeper: IdleSweeper<SoloRunEntry>;
  private readonly idleTtlMs: number;

  constructor(private deps: SoloEngineDependencies) {
    this.idleTtlMs =
      deps.idleTtlMs ??
      (Number(process.env.SOLO_RUN_IDLE_TTL_MS) || DEFAULT_IDLE_TTL_MS);
    this.persistence = new SoloPersistence(
      deps.gameStates,
      (runId) => this.runs.get(runId),
    );
    this.lifecycle = new SoloRunLifecycle({
      players: deps.players,
      solo: deps.solo,
      persistence: this.persistence,
      runs: this.runs,
    });
    const sweepIntervalMs = deps.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
    this.sweeper = new IdleSweeper({
      intervalMs: sweepIntervalMs,
      idleTtlMs: this.idleTtlMs,
      entries: () => this.runs.entries(),
      lastActivityAt: (_runId, entry) => entry.lastActivityAt,
      onEvict: (runId) => {
        this.runs.delete(runId);
        void this.persistence.deleteRun(runId);
      },
    });
  }

  async restore(): Promise<void> {
    await this.persistence.restore(
      { idleTtlMs: this.idleTtlMs, now: Date.now() },
      (runId, snapshot) => {
        this.runs.set(runId, {
          run: snapshot.run,
          startedAt: new Date(snapshot.startedAt),
          lastActivityAt: snapshot.lastActivityAt,
          endRecorded: snapshot.endRecorded,
          pending: false,
        });
      },
    );
  }

  create(
    userId: string,
    displayName: string,
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<SoloRunState | null> {
    return this.lifecycle.create(
      userId,
      displayName,
      seasonYearMin,
      seasonYearMax,
    );
  }

  getRun(runId: string): SoloRunState | undefined {
    return this.runs.get(runId)?.run;
  }

  resumeRun(runId: string): SoloRunState | undefined {
    const entry = this.runs.get(runId);
    if (!entry) return undefined;
    entry.lastActivityAt = Date.now();
    void this.persistence.saveRun(runId);
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
        return await this.lifecycle.endWithOutcome(
          entry,
          "repeat",
          `${connectedPlayer.name} was already used in this chain — run over!`,
          false,
        );
      }

      if (run.lastConnectedPlayer) {
        const isValidMove = await this.deps.players.validateMove(
          run.lastConnectedPlayer.id,
          connectedPlayer.id,
          run.seasonYearMin,
          run.seasonYearMax,
        );

        if (!isValidMove) {
          return await this.lifecycle.endWithOutcome(
            entry,
            "invalid",
            `${connectedPlayer.name} did not play with ${run.lastConnectedPlayer.name} — run over!`,
            false,
          );
        }

        const connection = await this.deps.players.getConnectionDetails(
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
      const canContinue = await this.deps.players.hasAnyValidMove(
        connectedPlayer.id,
        usedPlayerIds,
        run.seasonYearMin,
        run.seasonYearMax,
      );

      if (!canContinue) {
        return await this.lifecycle.endWithOutcome(
          entry,
          "stuck",
          `No players left to connect to ${connectedPlayer.name} — run over!`,
          true,
        );
      }

      await this.persistence.saveRun(runId);
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

    const outcome = await this.lifecycle.endWithOutcome(
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
    this.sweeper.stop();
  }

  private collectUsedPlayerIds(run: SoloRunState): number[] {
    const used = new Set<number>();
    if (run.startingPlayer) used.add(run.startingPlayer.id);
    for (const move of run.moves) used.add(move.playerId);
    return Array.from(used);
  }
}
