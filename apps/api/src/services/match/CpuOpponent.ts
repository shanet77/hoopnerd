import type { CpuDifficulty, GameRoomState, Player } from "@repo/types";
import type { CpuEngine } from "../CpuEngine";
import type { MatchEvent, MoveOutcome } from "./events";

const CPU_THINKING_DELAY_MS = { min: 800, max: 2000 };

export interface CpuOpponentDependencies {
  cpuEngine?: CpuEngine;
  getRoom: (roomId: string) => GameRoomState | undefined;
  getCpuGame: (
    roomId: string,
  ) => { cpuPlayer: Player; difficulty: CpuDifficulty } | undefined;
  applyMove: (
    roomId: string,
    playerId: number,
    connectedPlayer: Player,
  ) => Promise<MoveOutcome>;
  forfeit: (roomId: string, winner: Player | null, reason: string) => void;
  publish: (event: MatchEvent) => void;
}

export class CpuOpponent {
  constructor(private deps: CpuOpponentDependencies) {}

  async runCpuTurn(
    roomId: string,
    cpuPlayer: Player,
    roomState: GameRoomState,
  ): Promise<void> {
    const game = this.deps.getCpuGame(roomId);
    if (!game || !this.deps.cpuEngine) return;

    try {
      this.deps.publish({ type: "cpu_thinking", roomId });

      const lastPlayer =
        roomState.lastConnectedPlayer || roomState.startingPlayer;
      if (!lastPlayer) {
        this.deps.forfeit(roomId, cpuPlayer, "Game state error — no last player.");
        return;
      }

      const usedPlayerIds = new Set<number>();
      if (roomState.startingPlayer) {
        usedPlayerIds.add(roomState.startingPlayer.id);
      }
      for (const move of roomState.moves) {
        usedPlayerIds.add(move.playerId);
      }

      const delay =
        Math.random() *
          (CPU_THINKING_DELAY_MS.max - CPU_THINKING_DELAY_MS.min) +
        CPU_THINKING_DELAY_MS.min;

      const [chosenPlayer] = await Promise.all([
        this.deps.cpuEngine.getBestMove(
          lastPlayer,
          Array.from(usedPlayerIds),
          game.difficulty,
          roomState.seasonYearMin,
          roomState.seasonYearMax,
        ),
        new Promise<void>((resolve) => setTimeout(resolve, delay)),
      ]);

      if (!chosenPlayer) {
        this.forfeitToHuman(
          roomId,
          cpuPlayer,
          "CPU has no valid moves! You win!",
        );
        return;
      }

      const outcome = await this.deps.applyMove(
        roomId,
        cpuPlayer.id,
        chosenPlayer,
      );
      if (!outcome.success) {
        this.forfeitToHuman(
          roomId,
          cpuPlayer,
          "CPU made an invalid move — you win!",
        );
      }
    } catch (error) {
      console.error(
        `[MatchEngine] Error executing CPU turn in room ${roomId}:`,
        error,
      );
      this.forfeitToHuman(
        roomId,
        cpuPlayer,
        "CPU encountered an error — you win!",
      );
    }
  }

  private forfeitToHuman(
    roomId: string,
    cpuPlayer: Player,
    reason: string,
  ): void {
    const room = this.deps.getRoom(roomId);
    if (!room || room.gameCompleted) return;
    const humanPlayer = room.players.find((player) => !player.isCpu);
    this.deps.forfeit(roomId, humanPlayer ?? cpuPlayer, reason);
  }
}
