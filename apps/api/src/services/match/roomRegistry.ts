import type { CpuDifficulty, GameRoomState, Player } from "@repo/types";
import { createGameRoom } from "../../serverUtils";
import { generatePlayerId } from "../../socketAuth";

export const CPU_PLAYER_NAME = "BronBot";

export interface CpuGame {
  cpuPlayer: Player;
  difficulty: CpuDifficulty;
}

export class RoomRegistry {
  private gameRooms = new Map<string, GameRoomState>();
  private cpuGames = new Map<string, CpuGame>();

  createRoom(roomId: string, friendsOnly = false): GameRoomState {
    const room = createGameRoom(roomId, friendsOnly);
    this.gameRooms.set(roomId, room);
    return room;
  }

  getRoom(roomId: string): GameRoomState | undefined {
    return this.gameRooms.get(roomId);
  }

  setRoom(roomId: string, room: GameRoomState): void {
    this.gameRooms.set(roomId, room);
  }

  getOrCreateRoom(roomId: string): GameRoomState {
    return this.gameRooms.get(roomId) ?? this.createRoom(roomId);
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

  createCpuGame(
    roomId: string,
    humanPlayerName: string,
    difficulty: CpuDifficulty,
    humanSocketId: string,
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): { room: GameRoomState; humanPlayer: Player; cpuPlayer: Player } {
    const room = this.createRoom(roomId, false);

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

    room.players = [humanPlayer, cpuPlayer];
    this.cpuGames.set(roomId, { cpuPlayer, difficulty });

    return { room, humanPlayer, cpuPlayer };
  }

  getCpuGame(roomId: string): CpuGame | undefined {
    return this.cpuGames.get(roomId);
  }

  setCpuGame(roomId: string, game: CpuGame): void {
    this.cpuGames.set(roomId, game);
  }

  deleteCpuGame(roomId: string): void {
    this.cpuGames.delete(roomId);
  }

  deleteRoom(roomId: string): void {
    this.gameRooms.delete(roomId);
    this.cpuGames.delete(roomId);
  }

  rooms(): IterableIterator<[string, GameRoomState]> {
    return this.gameRooms.entries();
  }
}
