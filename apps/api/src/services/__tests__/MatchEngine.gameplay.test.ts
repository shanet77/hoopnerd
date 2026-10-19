import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MatchEngine } from "../MatchEngine";
import type { Player, GameRoomState } from "@repo/types";
import {
  buildActiveRoom,
  createMockRepo,
  PREVIOUS_PLAYER,
  createTestEngine,
  makePlayer,
  RecordingSink,
  setPreviousPlayer,
  type Mockify,
} from "./harness";

describe("MatchEngine gameplay", () => {
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

  describe("start", () => {
    it("should not start game with fewer than 2 players", async () => {
      engine.createRoom("ROOM1");
      const room = engine.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);

      const result = await engine.start("ROOM1");

      expect(result).toBe(false);
      expect(room.gameStarted).toBe(false);
    });

    it("should not start already started game", async () => {
      engine.createRoom("ROOM1");
      const room = engine.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);
      room.gameStarted = true;

      const result = await engine.start("ROOM1");

      expect(result).toBe(false);
    });

    it("should start game and emit event", async () => {
      const startingPlayer = {
        id: 100,
        name: "Tim Duncan",
        position: "PF",
      } as Player;
      mockRepo.getRandomTopScorer.mockResolvedValue(startingPlayer);

      engine.createRoom("ROOM1");
      const room = engine.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);

      const result = await engine.start("ROOM1");

      expect(result).toBe(true);
      expect(room.gameStarted).toBe(true);
      expect(room.startingPlayer).toEqual(startingPlayer);
      expect(room.lastConnectedPlayer).toEqual(startingPlayer);
      expect(sink.last("game_started")?.payload).toEqual(room);
    });

    it("should handle failure to get starting player", async () => {
      mockRepo.getRandomTopScorer.mockResolvedValue(null);

      engine.createRoom("ROOM1");
      const room = engine.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);

      const result = await engine.start("ROOM1");

      expect(result).toBe(false);
      expect(room.gameStarted).toBe(false);
      expect(sink.last("game_error")?.payload).toBe(
        "No players available to start the game.",
      );
    });

    it("should set random starting player index", async () => {
      mockRepo.getRandomTopScorer.mockResolvedValue({
        id: 1,
        name: "Test",
        position: "F",
      });
      vi.spyOn(Math, "random").mockReturnValue(0.5);

      engine.createRoom("ROOM1");
      const room = engine.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);

      await engine.start("ROOM1");

      expect(room.currentPlayerIndex).toBe(1);
    });
  });

  describe("game timeout", () => {
    it("should end game on turn timeout", async () => {
      mockRepo.getRandomTopScorer.mockResolvedValue({
        id: 99,
        name: "Test",
        position: "F",
      });

      engine.createRoom("ROOM1");
      const room = engine.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);

      await engine.start("ROOM1");

      const currentIndex = room.currentPlayerIndex;
      const expectedWinnerId =
        room.players[(currentIndex + 1) % room.players.length].id;

      vi.advanceTimersByTime(25000);

      expect(room.gameCompleted).toBe(true);
      expect(room.winner?.id).toBe(expectedWinnerId);
      expect(sink.last("game_over")?.payload).toEqual({
        winner: room.winner,
        reason: "Opponent timed out.",
      });
    });

    it("should clear timeout on game end", async () => {
      mockRepo.getRandomTopScorer.mockResolvedValue({
        id: 1,
        name: "Test",
        position: "G",
      });

      engine.createRoom("ROOM1");
      const room = engine.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);

      await engine.start("ROOM1");
      engine.forfeit("ROOM1", room.players[0], "Test end");

      vi.advanceTimersByTime(30000);

      expect(sink.of("game_over")).toHaveLength(1);
    });
  });

  describe("applyMove", () => {
    let room: GameRoomState;
    const newPlayer = makePlayer({
      id: 100,
      name: "NewPlayer",
      position: "C",
    });

    beforeEach(() => {
      room = buildActiveRoom(engine);
    });

    it("should reject move if game not active", async () => {
      room.gameCompleted = true;

      const result = await engine.applyMove("ROOM1", 1, newPlayer);

      expect(result.success).toBe(false);
      expect(result.message).toBe("Game is not active.");
    });

    it("should reject move if game not initialized", async () => {
      room.startingPlayer = null;

      const result = await engine.applyMove("ROOM1", 1, newPlayer);

      expect(result.success).toBe(false);
      expect(result.message).toBe("Game not properly initialized.");
    });

    it("should reject move from non-existent player", async () => {
      const result = await engine.applyMove("ROOM1", 999, newPlayer);

      expect(result.success).toBe(false);
      expect(result.message).toBe("Player is not part of this room.");
    });

    it("should reject move when not player's turn", async () => {
      room.currentPlayerIndex = 1;

      const result = await engine.applyMove("ROOM1", 1, newPlayer);

      expect(result.success).toBe(false);
      expect(result.message).toBe("Not your turn.");
    });

    it("should reject move for already used player", async () => {
      room.moves.push({
        playerId: 100,
        playerName: "UsedPlayer",
        position: "C",
      });

      const result = await engine.applyMove("ROOM1", 1, {
        id: 100,
        name: "UsedPlayer",
        position: "C",
      } as Player);

      expect(result.success).toBe(false);
      expect(result.message).toContain("already used");
    });

    it("should reject the starting player as already used", async () => {
      const result = await engine.applyMove("ROOM1", 1, room.startingPlayer!);

      expect(result.success).toBe(false);
      expect(result.message).toContain("already used");
    });

    it("should reject invalid connection", async () => {
      mockRepo.validateMove.mockResolvedValue(false);
      setPreviousPlayer(room);

      const result = await engine.applyMove("ROOM1", 1, newPlayer);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Invalid connection");
      expect(result.expectedPlayer).toBe("Previous");
      expect(result.errorPlayer).toBe("NewPlayer");
    });

    it("should accept valid move", async () => {
      setPreviousPlayer(room);

      const result = await engine.applyMove("ROOM1", 1, newPlayer);

      expect(result.success).toBe(true);
      expect(result.message).toContain("connected to chain");
      expect(room.moves).toHaveLength(1);
      expect(room.moves[0].playerId).toBe(100);
      expect(room.lastConnectedPlayer).toEqual(newPlayer);
    });

    it("should add connection details on valid move", async () => {
      const connectionDetails = {
        fromPlayer: PREVIOUS_PLAYER,
        toPlayer: newPlayer,
        teamName: "Spurs",
        seasonYear: 2005,
      };
      mockRepo.getConnectionDetails.mockResolvedValue(connectionDetails);
      setPreviousPlayer(room);

      await engine.applyMove("ROOM1", 1, newPlayer);

      expect(room.connections).toContainEqual(connectionDetails);
    });

    it("should emit move and turn events on success", async () => {
      setPreviousPlayer(room);

      await engine.applyMove("ROOM1", 1, newPlayer);

      expect(sink.last("move_submitted")?.payload.success).toBe(true);
      expect(sink.of("room_updated")).toHaveLength(1);
      expect(room.currentPlayerIndex).toBe(1);
      expect(sink.last("turn_changed")?.payload).toEqual(room.players[1]);
    });

    it("should emit a failed move without advancing the turn", async () => {
      mockRepo.validateMove.mockResolvedValue(false);
      setPreviousPlayer(room);

      await engine.applyMove("ROOM1", 1, newPlayer);

      expect(sink.last("move_submitted")?.payload.success).toBe(false);
      expect(sink.of("turn_changed")).toHaveLength(0);
      expect(room.currentPlayerIndex).toBe(0);
    });

    it("should handle starting move (no previous player)", async () => {
      room.lastConnectedPlayer = null;

      const result = await engine.applyMove("ROOM1", 1, newPlayer);

      expect(result.success).toBe(true);
      expect(result.message).toContain("connected to start");
    });
  });

  describe("forfeit", () => {
    it("should mark game complete and emit event", () => {
      engine.createRoom("ROOM1");
      const room = engine.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);

      engine.forfeit("ROOM1", room.players[0], "Test ended");

      expect(room.gameCompleted).toBe(true);
      expect(room.winner?.id).toBe(1);
      expect(sink.last("game_over")?.payload).toEqual({
        winner: room.players[0],
        reason: "Test ended",
      });
    });

    it("should not end already completed game", () => {
      engine.createRoom("ROOM1");
      const room = engine.getRoom("ROOM1")!;
      room.gameCompleted = true;

      engine.forfeit("ROOM1", null, "Test");

      expect(sink.of("game_over")).toHaveLength(0);
    });

    it("should record stats on game end", async () => {
      mockRepo.recordGameStats.mockImplementation((room: any) => {
        room.statsRecorded = true;
      });

      engine.createRoom("ROOM1");
      const room = engine.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.moves.push({
        playerId: 100,
        playerName: "UsedPlayer1",
        position: "C",
      });
      room.connections.push({
        fromPlayer: { id: 1, name: "Player1", position: "G" },
        toPlayer: { id: 100, name: "UsedPlayer1", position: "C" },
        teamName: "Spurs",
        seasonYear: 2005,
      } as any);

      engine.forfeit("ROOM1", room.players[0], "Test ended");

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockRepo.recordGameStats).toHaveBeenCalled();
      expect(room.statsRecorded).toBe(true);
    }, 10000);

    it("should not record stats twice", async () => {
      mockRepo.recordGameStats.mockResolvedValue(undefined);

      engine.createRoom("ROOM1");
      const room = engine.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);

      engine.forfeit("ROOM1", room.players[0], "Test ended");
      engine.forfeit("ROOM1", room.players[0], "Test ended again");

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockRepo.recordGameStats).toHaveBeenCalledTimes(1);
    }, 10000);
  });
});
