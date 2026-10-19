import type { Player, SoloEndReason, SoloRunState } from "@repo/types";
import type { PlayersRepository, SoloRepository } from "@repo/database";
import type { SoloMoveOutcome, SoloRunEntry } from "./events";
import { generateRunId } from "./RunIds";
import type { SoloPersistence } from "./SoloPersistence";

const STARTING_PLAYER_ATTEMPTS = 5;

export interface SoloRunLifecycleDependencies {
  players: PlayersRepository;
  solo: SoloRepository;
  persistence: SoloPersistence;
  runs: Map<string, SoloRunEntry>;
}

export class SoloRunLifecycle {
  constructor(private readonly deps: SoloRunLifecycleDependencies) {}

  async create(
    userId: string,
    displayName: string,
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<SoloRunState | null> {
    let startingPlayer: Player | null = null;
    for (let i = 0; i < STARTING_PLAYER_ATTEMPTS; i++) {
      const candidate = await this.deps.players.getRandomTopScorer(
        undefined,
        seasonYearMin,
        seasonYearMax,
      );
      if (!candidate) break;
      const hasMoves = await this.deps.players.hasAnyValidMove(
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

    const runId = generateRunId((id) => this.deps.runs.has(id));
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

    this.deps.runs.set(runId, {
      run,
      startedAt: new Date(),
      lastActivityAt: Date.now(),
      endRecorded: false,
      pending: false,
    });

    await this.deps.persistence.saveRun(runId);
    return run;
  }

  async endWithOutcome(
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
      await this.deps.persistence.deleteRun(run.roomId);
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
      const result = await this.deps.solo.recordSoloRun({
        userId: run.userId,
        displayName: run.displayName,
        streakCount: streak,
        endReason: reason,
        startedAt: entry.startedAt,
      });
      await this.deps.persistence.deleteRun(run.roomId);
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
      await this.deps.persistence.deleteRun(run.roomId);
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
}
