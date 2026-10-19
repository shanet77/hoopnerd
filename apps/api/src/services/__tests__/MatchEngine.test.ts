import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { MatchEngine } from "../MatchEngine";
import type { Player, GameRoomState } from "@repo/types";
import {
  createMockRepo,
  createTestEngine,
  makeStartedRoom,
  RecordingSink,
  type Mockify,
} from "./harness";

describe("MatchEngine", () => {
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

    beforeEach(() => {
      engine.createRoom("ROOM1");
      room = engine.getRoom("ROOM1")!;
      room.players.push({
        id: 1,
        name: "Player1",
        position: "G",
        socketId: "socket-1",
      } as Player);
      room.players.push({
        id: 2,
        name: "Player2",
        position: "F",
        socketId: "socket-2",
      } as Player);
      room.gameStarted = true;
      room.startingPlayer = {
        id: 99,
        name: "Starting",
        position: "C",
      } as Player;
      room.lastConnectedPlayer = room.startingPlayer;
      room.currentPlayerIndex = 0;
    });

    it("should reject move if game not active", async () => {
      room.gameCompleted = true;

      const result = await engine.applyMove("ROOM1", 1, {
        id: 100,
        name: "NewPlayer",
        position: "C",
      } as Player);

      expect(result.success).toBe(false);
      expect(result.message).toBe("Game is not active.");
    });

    it("should reject move if game not initialized", async () => {
      room.startingPlayer = null;

      const result = await engine.applyMove("ROOM1", 1, {
        id: 100,
        name: "NewPlayer",
        position: "C",
      } as Player);

      expect(result.success).toBe(false);
      expect(result.message).toBe("Game not properly initialized.");
    });

    it("should reject move from non-existent player", async () => {
      const result = await engine.applyMove("ROOM1", 999, {
        id: 100,
        name: "NewPlayer",
        position: "C",
      } as Player);

      expect(result.success).toBe(false);
      expect(result.message).toBe("Player is not part of this room.");
    });

    it("should reject move when not player's turn", async () => {
      room.currentPlayerIndex = 1;

      const result = await engine.applyMove("ROOM1", 1, {
        id: 100,
        name: "NewPlayer",
        position: "C",
      } as Player);

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
      room.lastConnectedPlayer = {
        id: 50,
        name: "Previous",
        position: "C",
      } as Player;

      const result = await engine.applyMove("ROOM1", 1, {
        id: 100,
        name: "NewPlayer",
        position: "C",
      } as Player);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Invalid connection");
      expect(result.expectedPlayer).toBe("Previous");
      expect(result.errorPlayer).toBe("NewPlayer");
    });

    it("should accept valid move", async () => {
      room.lastConnectedPlayer = {
        id: 50,
        name: "Previous",
        position: "C",
      } as Player;

      const newPlayer = { id: 100, name: "NewPlayer", position: "C" } as Player;
      const result = await engine.applyMove("ROOM1", 1, newPlayer);

      expect(result.success).toBe(true);
      expect(result.message).toContain("connected to chain");
      expect(room.moves).toHaveLength(1);
      expect(room.moves[0].playerId).toBe(100);
      expect(room.lastConnectedPlayer).toEqual(newPlayer);
    });

    it("should add connection details on valid move", async () => {
      const connectionDetails = {
        fromPlayer: { id: 50, name: "Previous", position: "C" },
        toPlayer: { id: 100, name: "NewPlayer", position: "C" },
        teamName: "Spurs",
        seasonYear: 2005,
      };
      mockRepo.getConnectionDetails.mockResolvedValue(connectionDetails);
      room.lastConnectedPlayer = {
        id: 50,
        name: "Previous",
        position: "C",
      } as Player;

      await engine.applyMove("ROOM1", 1, {
        id: 100,
        name: "NewPlayer",
        position: "C",
      } as Player);

      expect(room.connections).toContainEqual(connectionDetails);
    });

    it("should emit move and turn events on success", async () => {
      room.lastConnectedPlayer = {
        id: 50,
        name: "Previous",
        position: "C",
      } as Player;

      await engine.applyMove("ROOM1", 1, {
        id: 100,
        name: "NewPlayer",
        position: "C",
      } as Player);

      expect(sink.last("move_submitted")?.payload.success).toBe(true);
      expect(sink.of("room_updated")).toHaveLength(1);
      expect(room.currentPlayerIndex).toBe(1);
      expect(sink.last("turn_changed")?.payload).toEqual(room.players[1]);
    });

    it("should emit a failed move without advancing the turn", async () => {
      mockRepo.validateMove.mockResolvedValue(false);
      room.lastConnectedPlayer = {
        id: 50,
        name: "Previous",
        position: "C",
      } as Player;

      await engine.applyMove("ROOM1", 1, {
        id: 100,
        name: "NewPlayer",
        position: "C",
      } as Player);

      expect(sink.last("move_submitted")?.payload.success).toBe(false);
      expect(sink.of("turn_changed")).toHaveLength(0);
      expect(room.currentPlayerIndex).toBe(0);
    });

    it("should handle starting move (no previous player)", async () => {
      room.lastConnectedPlayer = null;

      const result = await engine.applyMove("ROOM1", 1, {
        id: 100,
        name: "NewPlayer",
        position: "C",
      } as Player);

      expect(result.success).toBe(true);
      expect(result.message).toContain("connected to start");
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

  describe("CPU turns", () => {
    const cpuEngine = {
      getBestMove: vi.fn(),
    };

    const setupCpuGame = async () => {
      mockRepo.getRandomTopScorer.mockResolvedValue({
        id: 500,
        name: "Starter",
        position: "C",
      });
      const cpuMatchEngine = createTestEngine({
        repo: mockRepo,
        sink,
        cpuEngine,
      });
      // Math.random drives both starting index (>= .5 → CPU) and delay.
      vi.spyOn(Math, "random").mockReturnValue(0.9);
      const created = cpuMatchEngine.createCpuGame(
        "CPUROOM",
        "Human",
        "easy",
        "sock-1",
      );
      await cpuMatchEngine.start("CPUROOM");
      return { cpuMatchEngine, created };
    };

    it("drives a CPU turn and returns control to the human", async () => {
      cpuEngine.getBestMove.mockResolvedValue({
        id: 777,
        name: "BotPick",
        position: "C",
      });
      const { created } = await setupCpuGame();
      const { room } = created;

      expect(room.currentPlayerIndex).toBe(1);

      await vi.advanceTimersByTimeAsync(2500);

      expect(cpuEngine.getBestMove).toHaveBeenCalledTimes(1);
      expect(sink.of("cpu_thinking")).toHaveLength(1);
      expect(room.moves).toHaveLength(1);
      expect(room.moves[0].playerId).toBe(777);
      expect(room.currentPlayerIndex).toBe(0);
    });

    it("forfeits to the human when the CPU has no valid moves", async () => {
      cpuEngine.getBestMove.mockResolvedValue(null);
      const { created } = await setupCpuGame();
      const { room } = created;

      await vi.advanceTimersByTimeAsync(2500);

      expect(room.gameCompleted).toBe(true);
      expect(room.winner?.id).toBe(room.players[0].id);
      expect(sink.last("game_over")?.payload.reason).toContain(
        "no valid moves",
      );
    });
  });

  describe("persistence", () => {
    it("saves a room snapshot on create", async () => {
      engine.createRoom("SAVE1");

      await engine.saveRoom("SAVE1");

      expect(mockRepo.saveGameState).toHaveBeenCalledWith(
        "match",
        "SAVE1",
        expect.objectContaining({
          version: 1,
          room: expect.objectContaining({ roomId: "SAVE1" }),
        }),
      );
    });

    it("restores a started room and restarts its turn timer", async () => {
      mockRepo.loadGameStates.mockResolvedValue([
        {
          id: "RESTORE1",
          state: { version: 1, room: makeStartedRoom("RESTORE1") },
          updatedAt: new Date(),
        },
      ]);

      await engine.restore();

      const restored = engine.getRoom("RESTORE1");
      expect(restored).toBeDefined();
      expect(restored?.players.map((player) => player.socketId)).toEqual([
        undefined,
        undefined,
      ]);

      vi.advanceTimersByTime(25000);

      expect(restored?.gameCompleted).toBe(true);
      expect(sink.last("game_over")).toBeDefined();
    });

    it("drops completed rooms and stale lobbies on restore", async () => {
      const completed = makeStartedRoom("DONE1");
      completed.gameCompleted = true;
      const staleLobby = makeStartedRoom("LOBBY1");
      staleLobby.gameStarted = false;
      staleLobby.players = [];
      staleLobby.startingPlayer = null;
      staleLobby.lastConnectedPlayer = null;

      mockRepo.loadGameStates.mockResolvedValue([
        {
          id: "DONE1",
          state: { version: 1, room: completed },
          updatedAt: new Date(),
        },
        {
          id: "LOBBY1",
          state: { version: 1, room: staleLobby },
          updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        },
      ]);

      await engine.restore();

      expect(engine.getRoom("DONE1")).toBeUndefined();
      expect(engine.getRoom("LOBBY1")).toBeUndefined();
      expect(mockRepo.deleteGameState).toHaveBeenCalledWith("match", "DONE1");
      expect(mockRepo.deleteGameState).toHaveBeenCalledWith("match", "LOBBY1");
    });
  });
});
