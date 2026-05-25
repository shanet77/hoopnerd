import { Server as SocketIOServer } from "socket.io";
import { Player, PlayerService, GameRoomState } from "@repo/types";
import databasePool from "@repo/database";
import { validateMove, getConnectionDetails } from "@repo/logic";
import { createGameRoom } from "../serverUtils";
import { SocketBindingManager, SocketBinding } from "./SocketBindingManager";
import { recordGameStats } from "./StatsRecorder";

export type { SocketBinding } from "./SocketBindingManager";

export class GameRoomRepository {
  private gameRooms: Map<string, GameRoomState> = new Map();
  private roomTimers: Map<string, NodeJS.Timeout> = new Map();
  private socketBindings: SocketBindingManager;

  /**
   * Callback invoked when it's a CPU player's turn instead of starting a timer.
   * Set by CpuGameService to trigger executeCpuTurn server-side, avoiding
   * socket-lifecycle issues (the CPU listener was on the lobby socket which
   * disconnects when the user navigates to the room page).
   */
  public onCpuTurn:
    | ((roomId: string, cpuPlayer: Player, room: GameRoomState) => void)
    | null = null;

  private readonly TURN_TIMEOUT_MS =
    Number(process.env.TURN_TIMEOUT_MS) || 25000;

  constructor(
    private io: SocketIOServer,
    private playerService: PlayerService,
  ) {
    this.socketBindings = new SocketBindingManager(io, (roomId, playerId) =>
      this.removePlayerFromRoom(roomId, playerId, "disconnected"),
    );
  }

  clearDisconnectGraceTimer(roomId: string, playerId: number): void {
    this.socketBindings.clearDisconnectGraceTimer(roomId, playerId);
  }

  createRoom(roomId: string, friendsOnly = false): GameRoomState {
    const room = createGameRoom(roomId, friendsOnly);
    this.gameRooms.set(roomId, room);
    return room;
  }

  getRoom(roomId: string): GameRoomState | undefined {
    return this.gameRooms.get(roomId);
  }

  getOrCreateRoom(roomId: string): GameRoomState {
    let room = this.gameRooms.get(roomId);
    if (!room) {
      room = createGameRoom(roomId);
      this.gameRooms.set(roomId, room);
    }
    return room;
  }

  findAvailablePublicRoom(excludeName?: string): string | null {
    for (const [roomId, room] of this.gameRooms.entries()) {
      if (
        !room.friendsOnly &&
        room.players.length < 2 &&
        !room.gameStarted &&
        !room.players.some(
          (player) =>
            excludeName &&
            player.name.toLowerCase() === excludeName.toLowerCase(),
        )
      ) {
        return roomId;
      }
    }
    return null;
  }

  bindSocket(socketId: string, roomId: string, playerId: number): void {
    this.socketBindings.bindSocket(socketId, roomId, playerId);
  }

  getSocketBinding(socketId: string): SocketBinding | undefined {
    return this.socketBindings.getSocketBinding(socketId);
  }

  removeSocketBinding(socketId: string): void {
    this.socketBindings.removeSocketBinding(socketId);
  }

  async startGame(roomId: string): Promise<boolean> {
    const room = this.gameRooms.get(roomId);
    if (room && room.players.length >= 2 && !room.gameStarted) {
      room.gameStarted = true;
      room.currentPlayerIndex = Math.floor(Math.random() * room.players.length);

      const startingPlayer = await this.playerService.getRandomTopScorer();
      if (!startingPlayer) {
        room.gameStarted = false;
        this.io
          .to(roomId)
          .emit("game_error", "No players available to start the game.");
        return false;
      }

      room.startingPlayer = startingPlayer;
      room.lastConnectedPlayer = startingPlayer;
      this.io.to(roomId).emit("game_started", room);
      this.startTurnTimer(roomId);
      return true;
    }
    return false;
  }

  private startTurnTimer(roomId: string): void {
    if (this.roomTimers.has(roomId)) {
      clearTimeout(this.roomTimers.get(roomId)!);
    }

    const room = this.gameRooms.get(roomId);
    if (!room || room.gameCompleted) return;

    // For CPU players, delegate to the CPU service instead of starting a timer.
    // This is server-side (not socket-bound), so it survives socket reconnects
    // when the user navigates between pages.
    const currentPlayer = room.players[room.currentPlayerIndex];
    if (currentPlayer?.isCpu) {
      if (this.onCpuTurn) {
        this.onCpuTurn(roomId, currentPlayer, room);
      }
      return;
    }

    const timer = setTimeout(() => {
      if (room.players.length > 1) {
        const winner =
          room.players[(room.currentPlayerIndex + 1) % room.players.length];
        this.endGame(roomId, winner, "Opponent timed out.");
      }
    }, this.TURN_TIMEOUT_MS);

    this.roomTimers.set(roomId, timer);
  }

  switchTurn(roomId: string): void {
    const room = this.gameRooms.get(roomId);
    if (!room) return;

    room.currentPlayerIndex =
      (room.currentPlayerIndex + 1) % room.players.length;
    this.io
      .to(roomId)
      .emit("turn_changed", room.players[room.currentPlayerIndex]);
    this.startTurnTimer(roomId);
  }

  endGame(roomId: string, winner: Player | null, reason: string): void {
    const room = this.gameRooms.get(roomId);
    if (!room || room.gameCompleted) return;

    room.gameCompleted = true;
    room.winner = winner;

    if (this.roomTimers.has(roomId)) {
      clearTimeout(this.roomTimers.get(roomId)!);
      this.roomTimers.delete(roomId);
    }

    this.io.to(roomId).emit("game_over", { winner: room.winner, reason });
    recordGameStats(room).catch((error) => {
      console.error("Error recording stats:", error);
    });
  }

  removePlayerFromRoom(
    roomId: string,
    playerId: number,
    reason: "left" | "disconnected",
  ): void {
    const room = this.gameRooms.get(roomId);
    if (!room) return;

    const playerIndex = room.players.findIndex(
      (player) => player.id === playerId,
    );
    if (playerIndex === -1) return;

    const removedPlayer = room.players[playerIndex];
    room.players.splice(playerIndex, 1);
    this.io.to(roomId).emit("player_disconnected", removedPlayer.name);

    if (room.gameStarted && !room.gameCompleted && room.players.length < 2) {
      const winner = room.players[0] || null;
      this.endGame(
        roomId,
        winner,
        reason === "left"
          ? "Opponent left the room."
          : "Opponent disconnected.",
      );
    }

    room.currentPlayerIndex =
      room.players.length > 0
        ? room.currentPlayerIndex % room.players.length
        : 0;
    this.io.to(roomId).emit("room_updated", room);
  }

  handleDisconnect(socketId: string): void {
    this.socketBindings.handleDisconnect(socketId);
  }

  async submitMove(
    roomId: string,
    playerId: number,
    connectedPlayer: Player,
  ): Promise<{
    success: boolean;
    message: string;
    errorPlayer?: string;
    expectedPlayer?: string;
  }> {
    const room = this.gameRooms.get(roomId);
    if (!room || room.gameCompleted) {
      return { success: false, message: "Game is not active." };
    }

    if (!room.startingPlayer) {
      return { success: false, message: "Game not properly initialized." };
    }

    const requestingPlayer = room.players.find(
      (player) => player.id === playerId,
    );
    if (!requestingPlayer) {
      return { success: false, message: "Player is not part of this room." };
    }

    const currentPlayerTurn = room.players[room.currentPlayerIndex];
    if (currentPlayerTurn.id !== requestingPlayer.id) {
      return { success: false, message: "Not your turn." };
    }

    const wasUsed = room.moves.some(
      (move) => move.playerId === connectedPlayer.id,
    );
    if (wasUsed) {
      return {
        success: false,
        message: `Invalid move! ${connectedPlayer.name} was already used in this game.`,
      };
    }

    if (room.lastConnectedPlayer) {
      const isValidMove = await validateMove(
        databasePool,
        room.lastConnectedPlayer.id,
        connectedPlayer.id,
      );

      if (!isValidMove) {
        return {
          success: false,
          message: `Invalid connection! ${connectedPlayer.name} did not play with ${room.lastConnectedPlayer.name}`,
          errorPlayer: connectedPlayer.name,
          expectedPlayer: room.lastConnectedPlayer.name,
        };
      }

      const connection = await getConnectionDetails(
        databasePool,
        room.lastConnectedPlayer.id,
        connectedPlayer.id,
      );
      if (connection) {
        room.connections.push(connection);
      }
    }

    const previousConnectedPlayer = room.lastConnectedPlayer;
    room.moves.push({
      playerId: connectedPlayer.id,
      playerName: connectedPlayer.name,
      position: connectedPlayer.position,
    });
    room.lastConnectedPlayer = connectedPlayer;

    return {
      success: true,
      message: `${connectedPlayer.name} connected to ${previousConnectedPlayer ? "chain" : "start"}!`,
    };
  }

  /**
   * Direct internal move submission for CPU players.
   * Bypasses socket middleware — the CPU has no socket.
   * Validates the same game rules as submitMove, records the move,
   * and switches turn back to the human.
   */
  submitCpuMove(
    roomId: string,
    cpuPlayerId: number,
    connectedPlayer: Player,
  ): void {
    const room = this.gameRooms.get(roomId);
    if (!room || room.gameCompleted) {
      console.warn(
        `[submitCpuMove] Room ${roomId} not found or game already completed`,
      );
      return;
    }

    // Verify it's actually a CPU player's turn
    const currentPlayer = room.players[room.currentPlayerIndex];
    if (
      !currentPlayer ||
      !currentPlayer.isCpu ||
      currentPlayer.id !== cpuPlayerId
    ) {
      console.warn(
        `[submitCpuMove] Room ${roomId} — turn check failed. ` +
          `currentPlayer=${JSON.stringify({ id: currentPlayer?.id, isCpu: currentPlayer?.isCpu })}, ` +
          `expectedCpuId=${cpuPlayerId}`,
      );
      return;
    }

    console.log(
      `[submitCpuMove] Room ${roomId} — validating CPU move: ${connectedPlayer.name} #${connectedPlayer.id}`,
    );

    // Validate the move
    validateMove(databasePool, room.lastConnectedPlayer!.id, connectedPlayer.id)
      .then(async (isValid) => {
        if (!isValid) {
          // CPU made an invalid move somehow — forfeit
          const humanPlayer = room.players.find((p) => !p.isCpu);
          if (humanPlayer) {
            this.endGame(roomId, humanPlayer, "Invalid move by CPU — you win!");
          }
          return;
        }

        // Check if player was already used
        const wasUsed =
          room.moves.some((move) => move.playerId === connectedPlayer.id) ||
          room.startingPlayer?.id === connectedPlayer.id;

        if (wasUsed) {
          const humanPlayer = room.players.find((p) => !p.isCpu);
          if (humanPlayer) {
            this.endGame(
              roomId,
              humanPlayer,
              "CPU re-used a player — you win!",
            );
          }
          return;
        }

        // Get connection details
        let connection = null;
        if (room.lastConnectedPlayer) {
          connection = await getConnectionDetails(
            databasePool,
            room.lastConnectedPlayer.id,
            connectedPlayer.id,
          );
        }

        // Record the move
        room.moves.push({
          playerId: connectedPlayer.id,
          playerName: connectedPlayer.name,
          position: connectedPlayer.position,
        });

        if (connection) {
          room.connections.push(connection);
        }

        room.lastConnectedPlayer = connectedPlayer;

        // Emit move result to the room
        this.io.to(roomId).emit("move_submitted", {
          success: true,
          message: `${connectedPlayer.name} connected to chain!`,
          roomState: room,
        });
        this.io.to(roomId).emit("room_updated", room);

        // Switch turn back to human
        this.switchTurn(roomId);
      })
      .catch((error) => {
        console.error("Error validating CPU move:", error);
        const humanPlayer = room.players.find((p) => !p.isCpu);
        if (humanPlayer) {
          this.endGame(roomId, humanPlayer, "CPU move error — you win!");
        }
      });
  }

  emitToRoom(roomId: string, event: string, ...args: any[]): void {
    this.io.to(roomId).emit(event, ...args);
  }

  getRoomState(roomId: string): GameRoomState | undefined {
    return this.gameRooms.get(roomId);
  }
}
