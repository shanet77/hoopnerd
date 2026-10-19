import { vi } from "vitest";
import type { GameRoomState } from "@repo/types";
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
