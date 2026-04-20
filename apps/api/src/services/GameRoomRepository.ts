import { Server as SocketIOServer } from 'socket.io';
import {
  Player,
  PlayerService,
  GameRoomState,
} from "@repo/types";
import databasePool from "@repo/database";
import { validateMove, getConnectionDetails } from "@repo/logic";
import { createGameRoom } from "../serverUtils";

interface SocketBinding {
  roomId: string;
  playerId: number;
}

interface DisconnectGracePeriod {
  timer: NodeJS.Timeout;
  roomId: string;
  playerId: number;
}

export class GameRoomRepository {
  private gameRooms: Map<string, GameRoomState> = new Map();
  private roomTimers: Map<string, NodeJS.Timeout> = new Map();
  private socketRoomBindings: Map<string, SocketBinding> = new Map();
  private disconnectGraceTimers: Map<string, NodeJS.Timeout> = new Map();

  private readonly DISCONNECT_GRACE_PERIOD_MS = Number(process.env.DISCONNECT_GRACE_MS) || 10000;
  private readonly TURN_TIMEOUT_MS = Number(process.env.TURN_TIMEOUT_MS) || 25000;

  constructor(
    private io: SocketIOServer,
    private playerService: PlayerService
  ) {}

  private getDisconnectGraceKey(roomId: string, playerId: number): string {
    return `${roomId}:${playerId}`;
  }

  clearDisconnectGraceTimer(roomId: string, playerId: number): void {
    const key = this.getDisconnectGraceKey(roomId, playerId);
    const timer = this.disconnectGraceTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.disconnectGraceTimers.delete(key);
    }
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
        !room.players.some(player => 
          excludeName && player.name.toLowerCase() === excludeName.toLowerCase()
        )
      ) {
        return roomId;
      }
    }
    return null;
  }

  bindSocket(socketId: string, roomId: string, playerId: number): void {
    this.clearDisconnectGraceTimer(roomId, playerId);

    // Remove stale socket binding for same player
    for (const [boundSocketId, binding] of this.socketRoomBindings.entries()) {
      if (
        binding.roomId === roomId &&
        binding.playerId === playerId &&
        boundSocketId !== socketId
      ) {
        this.socketRoomBindings.delete(boundSocketId);
        const staleSocket = this.io.sockets.sockets.get(boundSocketId);
        staleSocket?.disconnect(true);
      }
    }

    this.socketRoomBindings.set(socketId, { roomId, playerId });
  }

  getSocketBinding(socketId: string): SocketBinding | undefined {
    return this.socketRoomBindings.get(socketId);
  }

  removeSocketBinding(socketId: string): void {
    this.socketRoomBindings.delete(socketId);
  }

  async startGame(roomId: string): Promise<boolean> {
    const room = this.gameRooms.get(roomId);
    if (room && room.players.length >= 2 && !room.gameStarted) {
      room.gameStarted = true;
      room.currentPlayerIndex = Math.floor(Math.random() * room.players.length);
      
      const startingPlayer = await this.playerService.getRandomTopScorer();
      if (!startingPlayer) {
        room.gameStarted = false;
        this.io.to(roomId).emit('game_error', 'No players available to start the game.');
        return false;
      }
      
      room.startingPlayer = startingPlayer;
      room.lastConnectedPlayer = startingPlayer;
      this.io.to(roomId).emit('game_started', room);
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

    const timer = setTimeout(() => {
      if (room.players.length > 1) {
        const winner = room.players[(room.currentPlayerIndex + 1) % room.players.length];
        this.endGame(roomId, winner, 'Opponent timed out.');
      }
    }, this.TURN_TIMEOUT_MS);

    this.roomTimers.set(roomId, timer);
  }

  switchTurn(roomId: string): void {
    const room = this.gameRooms.get(roomId);
    if (!room) return;
    
    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
    this.io.to(roomId).emit('turn_changed', room.players[room.currentPlayerIndex]);
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

    this.io.to(roomId).emit('game_over', { winner: room.winner, reason });
    this.recordStatsForRoom(room).catch((error) => {
      console.error('Error recording stats:', error);
    });
  }

  private async recordStatsForRoom(room: GameRoomState): Promise<void> {
    if (room.statsRecorded) return;
    room.statsRecorded = true;

    const rows: Array<[string, string | null, string | null, number | null, number | null]> = [];

    for (const move of room.moves) {
      rows.push(['player', move.playerName, null, null, null]);
    }

    for (const connection of room.connections) {
      if (connection.teamName) {
        rows.push(['team', null, connection.teamName, null, null]);
      }
      if (connection.seasonYear) {
        rows.push(['season', null, null, connection.seasonYear, null]);
      }
    }

    rows.push(['streak', null, null, null, room.connections.length]);

    if (rows.length === 0) return;

    const placeholders = rows
      .map((_, index) => {
        const offset = index * 5;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
      })
      .join(', ');

    await databasePool.query(
      `
        INSERT INTO stats_events (event_type, player_name, team_name, season_year, streak_count)
        VALUES ${placeholders}
      `,
      rows.flat()
    );
  }

  removePlayerFromRoom(roomId: string, playerId: number, reason: 'left' | 'disconnected'): void {
    const room = this.gameRooms.get(roomId);
    if (!room) return;

    const playerIndex = room.players.findIndex(player => player.id === playerId);
    if (playerIndex === -1) return;

    const removedPlayer = room.players[playerIndex];
    room.players.splice(playerIndex, 1);
    this.io.to(roomId).emit('player_disconnected', removedPlayer.name);

    if (room.gameStarted && !room.gameCompleted && room.players.length < 2) {
      const winner = room.players[0] || null;
      this.endGame(
        roomId,
        winner,
        reason === 'left' ? 'Opponent left the room.' : 'Opponent disconnected.'
      );
    }

    room.currentPlayerIndex = room.players.length > 0
      ? room.currentPlayerIndex % room.players.length
      : 0;
    this.io.to(roomId).emit('room_updated', room);
  }

  handleDisconnect(socketId: string): void {
    const binding = this.socketRoomBindings.get(socketId);
    if (binding) {
      this.socketRoomBindings.delete(socketId);
      const { roomId, playerId } = binding;
      
      this.clearDisconnectGraceTimer(roomId, playerId);

      const key = this.getDisconnectGraceKey(roomId, playerId);
      const timer = setTimeout(() => {
        const stillBound = Array.from(this.socketRoomBindings.values()).some(
          (activeBinding) =>
            activeBinding.roomId === roomId &&
            activeBinding.playerId === playerId
        );

        if (!stillBound) {
          this.removePlayerFromRoom(roomId, playerId, 'disconnected');
        }

        this.disconnectGraceTimers.delete(key);
      }, this.DISCONNECT_GRACE_PERIOD_MS);

      this.disconnectGraceTimers.set(key, timer);
    }
  }

  async submitMove(
    roomId: string,
    playerId: number,
    connectedPlayer: Player
  ): Promise<{ success: boolean; message: string; errorPlayer?: string; expectedPlayer?: string }> {
    const room = this.gameRooms.get(roomId);
    if (!room || room.gameCompleted) {
      return { success: false, message: 'Game is not active.' };
    }

    if (!room.startingPlayer) {
      return { success: false, message: 'Game not properly initialized.' };
    }

    const requestingPlayer = room.players.find(player => player.id === playerId);
    if (!requestingPlayer) {
      return { success: false, message: 'Player is not part of this room.' };
    }

    const currentPlayerTurn = room.players[room.currentPlayerIndex];
    if (currentPlayerTurn.id !== requestingPlayer.id) {
      return { success: false, message: 'Not your turn.' };
    }

    // Check if player was already used
    const wasUsed = room.moves.some(move => move.playerId === connectedPlayer.id);
    if (wasUsed) {
      return { 
        success: false, 
        message: `Invalid move! ${connectedPlayer.name} was already used in this game.` 
      };
    }

    if (room.lastConnectedPlayer) {
      const isValidMove = await validateMove(
        databasePool,
        room.lastConnectedPlayer.id,
        connectedPlayer.id
      );

      if (!isValidMove) {
        return {
          success: false,
          message: `Invalid connection! ${connectedPlayer.name} did not play with ${room.lastConnectedPlayer.name}`,
          errorPlayer: connectedPlayer.name,
          expectedPlayer: room.lastConnectedPlayer.name
        };
      }

      const connection = await getConnectionDetails(
        databasePool,
        room.lastConnectedPlayer.id,
        connectedPlayer.id
      );
      if (connection) {
        room.connections.push(connection);
      }
    }

    const previousConnectedPlayer = room.lastConnectedPlayer;
    room.moves.push({ 
      playerId: connectedPlayer.id, 
      playerName: connectedPlayer.name, 
      position: connectedPlayer.position 
    });
    room.lastConnectedPlayer = connectedPlayer;

    return {
      success: true,
      message: `${connectedPlayer.name} connected to ${previousConnectedPlayer ? 'chain' : 'start'}!`
    };
  }

  emitToRoom(roomId: string, event: string, ...args: any[]): void {
    this.io.to(roomId).emit(event, ...args);
  }

  getRoomState(roomId: string): GameRoomState | undefined {
    return this.gameRooms.get(roomId);
  }
}
