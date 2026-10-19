import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MatchEngine } from "../MatchEngine";
import type { Player } from "@repo/types";
import {
  createMockRepo,
  createTestEngine,
  RecordingSink,
  type Mockify,
} from "./harness";

describe("MatchEngine rooms", () => {
  let engine: MatchEngine;
  let sink: RecordingSink;
  let mockRepo: Mockify<any>;

  beforeEach(() => {
    vi.useFakeTimers();
    sink = new RecordingSink();

    mockRepo = createMockRepo();

    engine = createTestEngine({ repo: mockRepo, sink });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("createRoom", () => {
    it("should create a new room with given roomId", () => {
      const room = engine.createRoom("ABC123");

      expect(room.roomId).toBe("ABC123");
      expect(room.players).toEqual([]);
      expect(room.gameStarted).toBe(false);
      expect(room.gameCompleted).toBe(false);
    });

    it("should create a friends-only room when specified", () => {
      const room = engine.createRoom("ABC123", true);

      expect(room.friendsOnly).toBe(true);
    });
  });

  describe("getRoom", () => {
    it("should return undefined for non-existent room", () => {
      expect(engine.getRoom("NONEXISTENT")).toBeUndefined();
    });

    it("should return existing room", () => {
      engine.createRoom("ABC123");

      const room = engine.getRoom("ABC123");

      expect(room).toBeDefined();
      expect(room?.roomId).toBe("ABC123");
    });
  });

  describe("getOrCreateRoom", () => {
    it("should create room if it doesn't exist", () => {
      const room = engine.getOrCreateRoom("NEW123");

      expect(room.roomId).toBe("NEW123");
    });

    it("should return existing room if it exists", () => {
      const created = engine.createRoom("EXIST123");
      const retrieved = engine.getOrCreateRoom("EXIST123");

      expect(retrieved).toBe(created);
    });
  });

  describe("findAvailablePublicRoom", () => {
    it("should return null when no rooms exist", () => {
      expect(engine.findAvailablePublicRoom()).toBeNull();
    });

    it("should skip friends-only rooms", () => {
      engine.createRoom("PRIVATE1", true);

      expect(engine.findAvailablePublicRoom()).toBeNull();
    });

    it("should skip full rooms", () => {
      engine.createRoom("FULL123");
      const room = engine.getRoom("FULL123")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);

      expect(engine.findAvailablePublicRoom()).toBeNull();
    });

    it("should skip rooms that have started", () => {
      engine.createRoom("STARTED123");
      const room = engine.getRoom("STARTED123")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.gameStarted = true;

      expect(engine.findAvailablePublicRoom()).toBeNull();
    });

    it("should skip rooms with same player name", () => {
      engine.createRoom("SAME123");
      const room = engine.getRoom("SAME123")!;
      room.players.push({ id: 1, name: "Existing", position: "G" } as Player);

      expect(engine.findAvailablePublicRoom("existing")).toBeNull();
    });

    it("should return available room", () => {
      engine.createRoom("AVAIL123");
      const room = engine.getRoom("AVAIL123")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);

      expect(engine.findAvailablePublicRoom()).toBe("AVAIL123");
    });
  });

  describe("bindSocket", () => {
    it("should bind socket to player", () => {
      engine.createRoom("ROOM1");
      engine.bindSocket("socket-1", "ROOM1", 1);

      expect(engine.getSocketBinding("socket-1")).toEqual({
        roomId: "ROOM1",
        playerId: 1,
      });
    });

    it("should disconnect stale socket for same player", () => {
      engine.createRoom("ROOM1");
      engine.bindSocket("old-socket", "ROOM1", 1);
      engine.bindSocket("new-socket", "ROOM1", 1);

      expect(sink.disconnected).toContain("old-socket");
      expect(engine.getSocketBinding("old-socket")).toBeUndefined();
      expect(engine.getSocketBinding("new-socket")).toEqual({
        roomId: "ROOM1",
        playerId: 1,
      });
    });

    it("should clear disconnect grace timer when binding", () => {
      engine.createRoom("ROOM1");

      engine.bindSocket("socket-1", "ROOM1", 1);
      engine.removeSocketBinding("socket-1");
      engine.handleDisconnect("socket-1");

      engine.bindSocket("socket-2", "ROOM1", 1);

      vi.advanceTimersByTime(11000);

      const room = engine.getRoom("ROOM1");
      expect(room?.players).toHaveLength(0);
    });
  });

  describe("removePlayer", () => {
    it("should remove player and emit event", () => {
      engine.createRoom("ROOM1");
      const room = engine.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);

      engine.removePlayer("ROOM1", 1, "left");

      expect(room.players).toHaveLength(1);
      expect(room.players[0].id).toBe(2);
      expect(sink.last("player_disconnected")?.payload).toBe("Player1");
    });

    it("should end game if only one player remains during active game", () => {
      engine.createRoom("ROOM1");
      const room = engine.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);
      room.gameStarted = true;

      engine.removePlayer("ROOM1", 1, "left");

      expect(room.gameCompleted).toBe(true);
      expect(room.winner?.id).toBe(2);
      expect(sink.last("game_over")?.payload).toEqual(
        expect.objectContaining({ reason: "Opponent left the room." }),
      );
    });

    it("should not end game if not started", () => {
      engine.createRoom("ROOM1");
      const room = engine.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);

      engine.removePlayer("ROOM1", 1, "left");

      expect(room.gameCompleted).toBe(false);
    });

    it("should wrap currentPlayerIndex when player leaves", () => {
      engine.createRoom("ROOM1");
      const room = engine.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);
      room.players.push({ id: 3, name: "Player3", position: "C" } as Player);
      room.currentPlayerIndex = 2;

      engine.removePlayer("ROOM1", 1, "left");

      expect(room.players).toHaveLength(2);
      expect(room.currentPlayerIndex).toBe(0);
    });
  });

  describe("handleDisconnect", () => {
    it("should schedule removal after grace period", () => {
      engine.createRoom("ROOM1");
      const room = engine.getRoom("ROOM1")!;
      room.gameStarted = true;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);

      engine.bindSocket("socket-1", "ROOM1", 1);
      engine.handleDisconnect("socket-1");

      expect(room.players).toHaveLength(2);

      vi.advanceTimersByTime(10000);

      expect(room.players).toHaveLength(1);
      expect(room.players[0].id).toBe(2);
    });

    it("should cancel removal if player reconnects", () => {
      engine.createRoom("ROOM1");
      const room = engine.getRoom("ROOM1")!;
      room.gameStarted = true;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);

      engine.bindSocket("socket-1", "ROOM1", 1);
      engine.removeSocketBinding("socket-1");
      engine.handleDisconnect("socket-1");

      engine.bindSocket("socket-2", "ROOM1", 1);

      vi.advanceTimersByTime(11000);

      expect(room.players).toHaveLength(2);
    });
  });

  describe("clearDisconnectGraceTimer", () => {
    it("should clear pending disconnect timer", () => {
      engine.createRoom("ROOM1");
      const room = engine.getRoom("ROOM1")!;
      room.gameStarted = true;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);

      engine.bindSocket("socket-1", "ROOM1", 1);
      engine.removeSocketBinding("socket-1");
      engine.handleDisconnect("socket-1");

      engine.clearDisconnectGraceTimer("ROOM1", 1);

      vi.advanceTimersByTime(11000);

      expect(room.players).toHaveLength(2);
    });
  });
});
