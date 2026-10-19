import type { GameRoomState, Player } from "@repo/types";
import type { MatchEvent } from "./events";

export interface TurnControllerDependencies {
  turnTimeoutMs: number;
  getRoom: (roomId: string) => GameRoomState | undefined;
  publish: (event: MatchEvent) => void;
  forfeit: (roomId: string, winner: Player | null, reason: string) => void;
  runCpuTurn: (
    roomId: string,
    cpuPlayer: Player,
    room: GameRoomState,
  ) => void;
}

export class TurnController {
  private roomTimers = new Map<string, NodeJS.Timeout>();

  constructor(private deps: TurnControllerDependencies) {}

  switchTurn(roomId: string): void {
    const room = this.deps.getRoom(roomId);
    if (!room) return;

    room.currentPlayerIndex =
      (room.currentPlayerIndex + 1) % room.players.length;
    this.deps.publish({
      type: "turn_changed",
      roomId,
      payload: room.players[room.currentPlayerIndex],
    });
    this.startTurnTimer(roomId);
  }

  startTurnTimer(roomId: string): void {
    this.clearTimer(roomId);

    const room = this.deps.getRoom(roomId);
    if (!room || room.gameCompleted) return;

    const currentPlayer = room.players[room.currentPlayerIndex];
    if (currentPlayer?.isCpu) {
      this.deps.runCpuTurn(roomId, currentPlayer, room);
      return;
    }

    const timer = setTimeout(() => {
      const activeRoom = this.deps.getRoom(roomId);
      if (activeRoom && activeRoom.players.length > 1) {
        const winner =
          activeRoom.players[
            (activeRoom.currentPlayerIndex + 1) % activeRoom.players.length
          ];
        this.deps.forfeit(roomId, winner, "Opponent timed out.");
      }
    }, this.deps.turnTimeoutMs);

    this.roomTimers.set(roomId, timer);
  }

  clearTimer(roomId: string): void {
    const timer = this.roomTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.roomTimers.delete(roomId);
    }
  }

  clearAll(): void {
    for (const timer of this.roomTimers.values()) {
      clearTimeout(timer);
    }
    this.roomTimers.clear();
  }
}
