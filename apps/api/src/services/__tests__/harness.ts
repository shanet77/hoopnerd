import { vi } from "vitest";
import type { GameRoomState, Player } from "@repo/types";
import { MatchEngine, MatchEvent, MatchEventSink } from "../MatchEngine";

export class RecordingSink implements MatchEventSink {
  events: MatchEvent[] = [];
  disconnected: string[] = [];

  publish(event: MatchEvent): void {
    this.events.push(event);
  }

  disconnectSocket(socketId: string): void {
    this.disconnected.push(socketId);
  }

  of(type: MatchEvent["type"]): MatchEvent[] {
    return this.events.filter((event) => event.type === type);
  }

  last(type: MatchEvent["type"]): MatchEvent | undefined {
    const matches = this.of(type);
    return matches[matches.length - 1];
  }
}

export type Mockify<T> = { [K in keyof T]: ReturnType<typeof vi.fn> };

export function createMockRepo(): Mockify<any> {
  return {
    getRandomTopScorer: vi.fn(),
    validateMove: vi.fn().mockResolvedValue(true),
    getConnectionDetails: vi.fn().mockResolvedValue(null),
    recordGameStats: vi.fn().mockResolvedValue(undefined),
    saveGameState: vi.fn().mockResolvedValue(undefined),
    loadGameStates: vi.fn().mockResolvedValue([]),
    deleteGameState: vi.fn().mockResolvedValue(undefined),
  };
}

export function createTestEngine(options: {
  repo: Mockify<any>;
  sink: MatchEventSink;
  cpuEngine?: unknown;
}): MatchEngine {
  return new MatchEngine({
    players: options.repo as any,
    stats: options.repo as any,
    gameStates: options.repo as any,
    sink: options.sink,
    cpuEngine: options.cpuEngine as any,
    turnTimeoutMs: 25000,
    disconnectGraceMs: 10000,
  });
}

export function makePlayer(overrides: Partial<Player> = {}): Player {
  return { id: 1, name: "Player1", position: "G", ...overrides };
}

export const PREVIOUS_PLAYER: Player = {
  id: 50,
  name: "Previous",
  position: "C",
};

export function setPreviousPlayer(room: GameRoomState): void {
  room.lastConnectedPlayer = { ...PREVIOUS_PLAYER };
}

export function buildActiveRoom(
  engine: MatchEngine,
  roomId = "ROOM1",
): GameRoomState {
  engine.createRoom(roomId);
  const room = engine.getRoom(roomId)!;
  room.players.push(
    makePlayer({ id: 1, name: "Player1", position: "G", socketId: "socket-1" }),
  );
  room.players.push(
    makePlayer({ id: 2, name: "Player2", position: "F", socketId: "socket-2" }),
  );
  room.gameStarted = true;
  room.startingPlayer = makePlayer({ id: 99, name: "Starting", position: "C" });
  room.lastConnectedPlayer = room.startingPlayer;
  room.currentPlayerIndex = 0;
  return room;
}

export function makeStartedRoom(roomId: string): GameRoomState {
  return {
    roomId,
    players: [
      { id: 1, name: "Player1", position: "G", socketId: "socket-1" },
      { id: 2, name: "Player2", position: "F", socketId: "socket-2" },
    ],
    moves: [],
    currentPlayerIndex: 0,
    gameStarted: true,
    gameCompleted: false,
    winner: null,
    startingPlayer: { id: 99, name: "Starting", position: "C" },
    connections: [],
    lastConnectedPlayer: { id: 99, name: "Starting", position: "C" },
    friendsOnly: false,
    statsRecorded: false,
  };
}
