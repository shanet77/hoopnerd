import { CpuDifficulty, Player, GameRoomState } from "@repo/types";
import { CpuEngine } from "@repo/logic";
import { GameRoomRepository } from "./GameRoomRepository";
import { generatePlayerId } from "../socketAuth";

const CPU_THINKING_DELAY_MS = {
  min: 800,
  max: 2000,
};

const CPU_PLAYER_NAME = "BronBot";

/**
 * Orchestrates CPU game creation and turn execution.
 * The CPU is a virtual player without a socket turns are processed
 * internally via GameRoomRepository.submitCpuMove.
 *
 * Turn triggering is server-side (via GameRoomRepository.onCpuTurn callback)
 * rather than socket-bound, so it survives page navigations when the
 * lobby socket disconnects and the room socket reconnects.
 */
export class CpuGameService {
  /** Tracks active CPU games so we can respond to turn changes. */
  private cpuGames: Map<
    string,
    { cpuPlayer: Player; difficulty: CpuDifficulty }
  > = new Map();

  constructor(
    private roomRepository: GameRoomRepository,
    private cpuEngine: CpuEngine,
  ) {
    // Wire the server-side CPU turn trigger — called by startTurnTimer whenever
    // it's a CPU player's turn, regardless of which sockets are connected.
    this.roomRepository.onCpuTurn = (
      roomId: string,
      cpuPlayer: Player,
      room: GameRoomState,
    ) => {
      const game = this.cpuGames.get(roomId);
      if (!game) return; // Not a CPU game, or already cleaned up
      this.executeCpuTurn(roomId, cpuPlayer, game.difficulty, room).catch(
        (err) => {
          console.error(
            `[CpuGameService] Unhandled error in onCpuTurn for room ${roomId}:`,
            err,
          );
        },
      );
    };
  }

  /**
   * Creates a game room with one human player and one CPU virtual player.
   * Immediately starts the game. If the CPU goes first, schedules the first CPU turn.
   */
  createCpuGame(
    roomId: string,
    humanPlayerName: string,
    difficulty: CpuDifficulty,
    humanSocketId: string,
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): {
    room: GameRoomState;
    humanPlayer: Player;
    cpuPlayer: Player;
  } {
    const room = this.roomRepository.createRoom(roomId, false);

    if (seasonYearMin !== undefined && seasonYearMax !== undefined) {
      room.seasonYearMin = seasonYearMin;
      room.seasonYearMax = seasonYearMax;
    }

    const cpuPlayer: Player = {
      id: generatePlayerId(room),
      name: CPU_PLAYER_NAME,
      position: "C",
      isCpu: true,
    };

    const humanPlayer: Player = {
      id: generatePlayerId(room),
      name: humanPlayerName,
      position: "G",
      socketId: humanSocketId,
    };

    // CPU first in the array so currentPlayerIndex logic works normally
    // But for better UX, let human go first. Randomize or let human go first.
    room.players = [humanPlayer, cpuPlayer];

    // Track this game so the onCpuTurn callback can look up difficulty
    this.cpuGames.set(roomId, { cpuPlayer, difficulty });

    return { room, humanPlayer, cpuPlayer };
  }

  /**
   * Executes a CPU turn.
   * Called internally when it's the CPU's turn.
   *
   * Fires the best-move SQL query and the artificial delay timer in parallel
   * so that slow queries (e.g. Hard difficulty lookahead) don't pile on top
   * of the fixed delay. Total perceived wait ≈ max(SQL_time, delay_target).
   *
   * Steps:
   * 1. Emit cpu_thinking so the frontend shows the indicator immediately
   * 2. Kick off getBestMove (SQL) and a delayed promise in parallel
   * 3. Wait for whichever finishes last
   * 4. Submit the move, or forfeit if no valid move exists
   */
  async executeCpuTurn(
    roomId: string,
    cpuPlayer: Player,
    difficulty: CpuDifficulty,
    roomState: GameRoomState,
  ): Promise<void> {
    try {
      // emit cpu_thinking to the room so the frontend can show animation
      this.roomRepository.emitToRoom(roomId, "cpu_thinking");

      const lastPlayer =
        roomState.lastConnectedPlayer || roomState.startingPlayer;
      if (!lastPlayer) {
        console.error(
          `[CpuGameService] No lastPlayer for room ${roomId} — forfeiting CPU`,
        );
        this.roomRepository.endGame(
          roomId,
          cpuPlayer,
          "Game state error — no last player.",
        );
        return;
      }

      const usedPlayerIds = new Set<number>();
      if (roomState.startingPlayer) {
        usedPlayerIds.add(roomState.startingPlayer.id);
      }
      for (const move of roomState.moves) {
        usedPlayerIds.add(move.playerId);
      }

      console.log(
        `[CpuGameService] Room ${roomId} — CPU computing best move ` +
          `(difficulty=${difficulty}, lastPlayer=${lastPlayer.name} #${lastPlayer.id}, ` +
          `usedIds=[${Array.from(usedPlayerIds).join(",")}])`,
      );

      // Start the artificial-delay timer and the best-move SQL query in parallel
      const delay =
        Math.random() *
          (CPU_THINKING_DELAY_MS.max - CPU_THINKING_DELAY_MS.min) +
        CPU_THINKING_DELAY_MS.min;

      console.log(
        `[CpuGameService] Room ${roomId} — waiting ${Math.round(delay)}ms`,
      );

      const [chosenPlayer] = await Promise.all([
        this.cpuEngine.getBestMove(
          lastPlayer,
          Array.from(usedPlayerIds),
          difficulty,
          roomState.seasonYearMin,
          roomState.seasonYearMax,
        ),
        new Promise<void>((resolve) => setTimeout(resolve, delay)),
      ]);

      if (!chosenPlayer) {
        console.log(
          `[CpuGameService] Room ${roomId} — CPU has no valid moves, forfeiting`,
        );
        this.roomRepository.endGame(
          roomId,
          cpuPlayer,
          "CPU has no valid moves! You win!",
        );
        return;
      }

      console.log(
        `[CpuGameService] Room ${roomId} — CPU chose ${chosenPlayer.name} #${chosenPlayer.id}`,
      );
      this.roomRepository.submitCpuMove(roomId, cpuPlayer.id, chosenPlayer);
    } catch (error) {
      console.error(
        `[CpuGameService] Error executing CPU turn in room ${roomId}:`,
        error,
      );
      // Forfeit the CPU on error so the game doesn't hang
      const room = this.roomRepository.getRoom(roomId);
      if (room && !room.gameCompleted) {
        const humanPlayer = room.players.find((p) => !p.isCpu);
        this.roomRepository.endGame(
          roomId,
          humanPlayer || cpuPlayer,
          "CPU encountered an error — you win!",
        );
      }
    }
  }

  /**
   * Returns true if the given player is the CPU player.
   */
  isCpuPlayer(player: Player): boolean {
    return player.isCpu === true;
  }
}
