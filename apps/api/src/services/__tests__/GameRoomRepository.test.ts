import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { GameRoomRepository } from "../GameRoomRepository";
import type { Player, GameRoomState } from "@repo/types";
import { Server as SocketIOServer } from "socket.io";
import { validateMove, getConnectionDetails } from "@repo/logic";

type Mockify<T> = { [K in keyof T]: ReturnType<typeof vi.fn> };

vi.mock("@repo/logic", () => ({
  __esModule: true,
  validateMove: vi.fn<typeof validateMove>(),
  getConnectionDetails: vi.fn<typeof getConnectionDetails>(),
}));

const mockValidateMove = validateMove as vi.Mock<typeof validateMove>;
const mockGetConnectionDetails = getConnectionDetails as vi.Mock<typeof getConnectionDetails>;

describe("GameRoomRepository", () => {
  let repository: GameRoomRepository;
  let mockIo: Partial<SocketIOServer>;
  let mockRepo: Mockify<any>;
  let emitMock: vi.Mock;
  let toMock: vi.Mock;

  beforeEach(() => {
    vi.useFakeTimers();
    emitMock = vi.fn();
    toMock = vi.fn(() => ({ emit: emitMock }));
    
    mockIo = {
      to: toMock as any,
      sockets: {
        sockets: new Map(),
      } as any,
    };

    mockRepo = {
      getRandomTopScorer: vi.fn(),
      validateMove: vi.fn(),
      getConnectionDetails: vi.fn(),
      recordGameStats: vi.fn().mockResolvedValue(undefined),
    };

    repository = new GameRoomRepository(
      mockIo as SocketIOServer,
      mockRepo as any
    );

    mockValidateMove.mockResolvedValue(true as any);
    mockGetConnectionDetails.mockResolvedValue(null as any);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("createRoom", () => {
    it("should create a new room with given roomId", () => {
      const room = repository.createRoom("ABC123");

      expect(room.roomId).toBe("ABC123");
      expect(room.players).toEqual([]);
      expect(room.gameStarted).toBe(false);
      expect(room.gameCompleted).toBe(false);
    });

    it("should create a friends-only room when specified", () => {
      const room = repository.createRoom("ABC123", true);

      expect(room.friendsOnly).toBe(true);
    });
  });

  describe("getRoom", () => {
    it("should return undefined for non-existent room", () => {
      expect(repository.getRoom("NONEXISTENT")).toBeUndefined();
    });

    it("should return existing room", () => {
      repository.createRoom("ABC123");

      const room = repository.getRoom("ABC123");

      expect(room).toBeDefined();
      expect(room?.roomId).toBe("ABC123");
    });
  });

  describe("getOrCreateRoom", () => {
    it("should create room if it doesn't exist", () => {
      const room = repository.getOrCreateRoom("NEW123");

      expect(room.roomId).toBe("NEW123");
    });

    it("should return existing room if it exists", () => {
      const created = repository.createRoom("EXIST123");
      const retrieved = repository.getOrCreateRoom("EXIST123");

      expect(retrieved).toBe(created);
    });
  });

  describe("findAvailablePublicRoom", () => {
    it("should return null when no rooms exist", () => {
      expect(repository.findAvailablePublicRoom()).toBeNull();
    });

    it("should skip friends-only rooms", () => {
      repository.createRoom("PRIVATE1", true);
      
      expect(repository.findAvailablePublicRoom()).toBeNull();
    });

    it("should skip full rooms", () => {
      repository.createRoom("FULL123");
      const room = repository.getRoom("FULL123")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);

      expect(repository.findAvailablePublicRoom()).toBeNull();
    });

    it("should skip rooms that have started", () => {
      repository.createRoom("STARTED123");
      const room = repository.getRoom("STARTED123")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.gameStarted = true;

      expect(repository.findAvailablePublicRoom()).toBeNull();
    });

    it("should skip rooms with same player name", () => {
      repository.createRoom("SAME123");
      const room = repository.getRoom("SAME123")!;
      room.players.push({ id: 1, name: "Existing", position: "G" } as Player);

      expect(repository.findAvailablePublicRoom("existing")).toBeNull();
    });

    it("should return available room", () => {
      repository.createRoom("AVAIL123");
      const room = repository.getRoom("AVAIL123")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);

      expect(repository.findAvailablePublicRoom()).toBe("AVAIL123");
    });
  });

  describe("bindSocket", () => {
    it("should bind socket to player", () => {
      repository.createRoom("ROOM1");
      repository.bindSocket("socket-1", "ROOM1", 1);

      const binding = repository.getSocketBinding("socket-1");

      expect(binding).toEqual({ roomId: "ROOM1", playerId: 1 });
    });

    it("should disconnect stale socket for same player", () => {
      const disconnectMock = vi.fn();
      (mockIo.sockets!.sockets as Map<string, any>).set("old-socket", { disconnect: disconnectMock });
      
      repository.createRoom("ROOM1");
      repository.bindSocket("old-socket", "ROOM1", 1);
      repository.bindSocket("new-socket", "ROOM1", 1);

      expect(disconnectMock).toHaveBeenCalledWith(true);
      expect(repository.getSocketBinding("old-socket")).toBeUndefined();
      expect(repository.getSocketBinding("new-socket")).toEqual({ roomId: "ROOM1", playerId: 1 });
    });

    it("should clear disconnect grace timer when binding", () => {
      repository.createRoom("ROOM1");
      
      // Bind, then unbind to trigger grace period
      repository.bindSocket("socket-1", "ROOM1", 1);
      repository.removeSocketBinding("socket-1");
      
      // Handle disconnect starts timer
      repository.handleDisconnect("socket-1");
      
      // Binding again should clear it
      repository.bindSocket("socket-2", "ROOM1", 1);
      
      // Fast forward timer
      vi.advanceTimersByTime(11000);
      
      // Should not have removed player (timer was cleared)
      const room = repository.getRoom("ROOM1");
      expect(room?.players).toHaveLength(0);
    });
  });

  describe("startGame", () => {
    it("should not start game with fewer than 2 players", async () => {
      repository.createRoom("ROOM1");
      const room = repository.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);

      const result = await repository.startGame("ROOM1");

      expect(result).toBe(false);
      expect(room.gameStarted).toBe(false);
    });

    it("should not start already started game", async () => {
      repository.createRoom("ROOM1");
      const room = repository.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);
      room.gameStarted = true;

      const result = await repository.startGame("ROOM1");

      expect(result).toBe(false);
    });

    it("should start game and emit event", async () => {
      const startingPlayer = { id: 100, name: "Tim Duncan", position: "PF" } as Player;
      mockRepo.getRandomTopScorer.mockResolvedValue(startingPlayer);

      repository.createRoom("ROOM1");
      const room = repository.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);

      const result = await repository.startGame("ROOM1");

      expect(result).toBe(true);
      expect(room.gameStarted).toBe(true);
      expect(room.startingPlayer).toEqual(startingPlayer);
      expect(room.lastConnectedPlayer).toEqual(startingPlayer);
      expect(emitMock).toHaveBeenCalledWith("game_started", room);
    });

    it("should handle failure to get starting player", async () => {
      mockRepo.getRandomTopScorer.mockResolvedValue(null);

      repository.createRoom("ROOM1");
      const room = repository.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);

      const result = await repository.startGame("ROOM1");

      expect(result).toBe(false);
      expect(room.gameStarted).toBe(false);
      expect(emitMock).toHaveBeenCalledWith("game_error", "No players available to start the game.");
    });

    it("should set random starting player index", async () => {
      mockRepo.getRandomTopScorer.mockResolvedValue({ id: 1, name: "Test", position: "F" });
      vi.spyOn(Math, "random").mockReturnValue(0.5);

      repository.createRoom("ROOM1");
      const room = repository.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);

      await repository.startGame("ROOM1");

      expect(room.currentPlayerIndex).toBe(1);
    });
  });

  describe("game timeout", () => {
    it("should end game on turn timeout", async () => {
      mockRepo.getRandomTopScorer.mockResolvedValue({ id: 99, name: "Test", position: "F" });

      repository.createRoom("ROOM1");
      const room = repository.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);

      await repository.startGame("ROOM1");
      
      // Determine who is NOT the current player (they should win on timeout)
      const currentIndex = room.currentPlayerIndex;
      const expectedWinnerId = room.players[(currentIndex + 1) % room.players.length].id;

      vi.advanceTimersByTime(25000);

      expect(room.gameCompleted).toBe(true);
      expect(room.winner?.id).toBe(expectedWinnerId);
      expect(emitMock).toHaveBeenCalledWith("game_over", {
        winner: room.winner,
        reason: "Opponent timed out.",
      });
    });

    it("should clear timeout on game end", async () => {
      mockRepo.getRandomTopScorer.mockResolvedValue({ id: 1, name: "Test", position: "G" });

      repository.createRoom("ROOM1");
      const room = repository.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);

      await repository.startGame("ROOM1");
      repository.endGame("ROOM1", room.players[0], "Test end");

      // Advance past the original timeout
      vi.advanceTimersByTime(30000);

      // No additional game_over should be emitted
      const gameOverCalls = emitMock.mock.calls.filter(call => call[0] === "game_over");
      expect(gameOverCalls).toHaveLength(1);
    });
  });

  describe("switchTurn", () => {
    it("should switch to next player", () => {
      repository.createRoom("ROOM1");
      const room = repository.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);
      room.currentPlayerIndex = 0;
      room.gameStarted = true;

      emitMock.mockClear();

      repository.switchTurn("ROOM1");

      expect(room.currentPlayerIndex).toBe(1);
      expect(emitMock).toHaveBeenCalledWith("turn_changed", room.players[1]);
    });

    it("should wrap around to first player", () => {
      repository.createRoom("ROOM1");
      const room = repository.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);
      room.currentPlayerIndex = 1;
      room.gameStarted = true;

      repository.switchTurn("ROOM1");

      expect(room.currentPlayerIndex).toBe(0);
    });
  });

  describe("submitMove", () => {
    let room: GameRoomState;
    
    beforeEach(() => {
      repository.createRoom("ROOM1");
      room = repository.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G", socketId: "socket-1" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F", socketId: "socket-2" } as Player);
      room.gameStarted = true;
      room.startingPlayer = { id: 99, name: "Starting", position: "C" } as Player;
      room.lastConnectedPlayer = room.startingPlayer;
      room.currentPlayerIndex = 0;
    });

    it("should reject move if game not active", async () => {
      room.gameCompleted = true;

      const result = await repository.submitMove("ROOM1", 1, { id: 100, name: "NewPlayer", position: "C" } as Player);

      expect(result.success).toBe(false);
      expect(result.message).toBe("Game is not active.");
    });

    it("should reject move if game not initialized", async () => {
      room.startingPlayer = null;

      const result = await repository.submitMove("ROOM1", 1, { id: 100, name: "NewPlayer", position: "C" } as Player);

      expect(result.success).toBe(false);
      expect(result.message).toBe("Game not properly initialized.");
    });

    it("should reject move from non-existent player", async () => {
      const result = await repository.submitMove("ROOM1", 999, { id: 100, name: "NewPlayer", position: "C" } as Player);

      expect(result.success).toBe(false);
      expect(result.message).toBe("Player is not part of this room.");
    });

    it("should reject move when not player's turn", async () => {
      // Player 2's turn (index 1)
      room.currentPlayerIndex = 1;

      const result = await repository.submitMove("ROOM1", 1, { id: 100, name: "NewPlayer", position: "C" } as Player);

      expect(result.success).toBe(false);
      expect(result.message).toBe("Not your turn.");
    });

    it("should reject move for already used player", async () => {
      room.moves.push({ playerId: 100, playerName: "UsedPlayer", position: "C" });

      const result = await repository.submitMove("ROOM1", 1, { id: 100, name: "UsedPlayer", position: "C" } as Player);

      expect(result.success).toBe(false);
      expect(result.message).toContain("already used");
    });

    it("should reject invalid connection", async () => {
      mockValidateMove.mockResolvedValue(false as any);

      room.lastConnectedPlayer = { id: 50, name: "Previous", position: "C" } as Player;

      const result = await repository.submitMove("ROOM1", 1, { id: 100, name: "NewPlayer", position: "C" } as Player);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Invalid connection");
      expect(result.expectedPlayer).toBe("Previous");
      expect(result.errorPlayer).toBe("NewPlayer");
    });

    it("should accept valid move", async () => {
      room.lastConnectedPlayer = { id: 50, name: "Previous", position: "C" } as Player;

      const newPlayer = { id: 100, name: "NewPlayer", position: "C" } as Player;
      const result = await repository.submitMove("ROOM1", 1, newPlayer);

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
        seasonYear: 2005 
      };
      mockGetConnectionDetails.mockResolvedValue(connectionDetails as any);

      room.lastConnectedPlayer = { id: 50, name: "Previous", position: "C" } as Player;

      await repository.submitMove("ROOM1", 1, { id: 100, name: "NewPlayer", position: "C" } as Player);

      expect(room.connections).toContainEqual(connectionDetails);
    });

    it("should handle starting move (no previous player)", async () => {
      // Clear lastConnectedPlayer to simulate starting condition
      room.lastConnectedPlayer = null;

      const result = await repository.submitMove("ROOM1", 1, { id: 100, name: "NewPlayer", position: "C" } as Player);

      expect(result.success).toBe(true);
      expect(result.message).toContain("connected to start");
    });
  });

  describe("removePlayerFromRoom", () => {
    it("should remove player and emit event", () => {
      repository.createRoom("ROOM1");
      const room = repository.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);

      repository.removePlayerFromRoom("ROOM1", 1, "left");

      expect(room.players).toHaveLength(1);
      expect(room.players[0].id).toBe(2);
      expect(emitMock).toHaveBeenCalledWith("player_disconnected", "Player1");
    });

    it("should end game if only one player remains during active game", () => {
      repository.createRoom("ROOM1");
      const room = repository.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);
      room.gameStarted = true;

      repository.removePlayerFromRoom("ROOM1", 1, "left");

      expect(room.gameCompleted).toBe(true);
      expect(room.winner?.id).toBe(2);
      expect(emitMock).toHaveBeenCalledWith("game_over", expect.objectContaining({
        reason: "Opponent left the room.",
      }));
    });

    it("should not end game if not started", () => {
      repository.createRoom("ROOM1");
      const room = repository.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);

      repository.removePlayerFromRoom("ROOM1", 1, "left");

      expect(room.gameCompleted).toBe(false);
    });

    it("should wrap currentPlayerIndex when player leaves", () => {
      repository.createRoom("ROOM1");
      const room = repository.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);
      room.players.push({ id: 3, name: "Player3", position: "C" } as Player);
      room.currentPlayerIndex = 2; // Player3's turn

      repository.removePlayerFromRoom("ROOM1", 1, "left");

      // After removing Player1, modulo adjusts: 2 % 2 = 0
      expect(room.players).toHaveLength(2);
      expect(room.currentPlayerIndex).toBe(0);
    });
  });

  describe("handleDisconnect", () => {
    it("should schedule removal after grace period", () => {
      repository.createRoom("ROOM1");
      const room = repository.getRoom("ROOM1")!;
      room.gameStarted = true;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);

      // First bind socket, then simulate disconnect
      repository.bindSocket("socket-1", "ROOM1", 1);
      
      // handleDisconnect simulates the disconnect event
      repository.handleDisconnect("socket-1");

      // Before grace period, both players still in room
      expect(room.players).toHaveLength(2);

      // After grace period, disconnected player removed
      vi.advanceTimersByTime(10000);

      expect(room.players).toHaveLength(1);
      expect(room.players[0].id).toBe(2);
    });

    it("should cancel removal if player reconnects", () => {
      repository.createRoom("ROOM1");
      const room = repository.getRoom("ROOM1")!;
      room.gameStarted = true;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);

      repository.bindSocket("socket-1", "ROOM1", 1);
      repository.removeSocketBinding("socket-1");
      repository.handleDisconnect("socket-1");

      // Rebind before grace period
      repository.bindSocket("socket-2", "ROOM1", 1);

      vi.advanceTimersByTime(11000);

      expect(room.players).toHaveLength(2);
    });
  });

  describe("endGame", () => {
    it("should mark game complete and emit event", () => {
      repository.createRoom("ROOM1");
      const room = repository.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);

      repository.endGame("ROOM1", room.players[0], "Test ended");

      expect(room.gameCompleted).toBe(true);
      expect(room.winner?.id).toBe(1);
      expect(emitMock).toHaveBeenCalledWith("game_over", {
        winner: room.players[0],
        reason: "Test ended",
      });
    });

    it("should not end already completed game", () => {
      repository.createRoom("ROOM1");
      const room = repository.getRoom("ROOM1")!;
      room.gameCompleted = true;

      repository.endGame("ROOM1", null, "Test");

      expect(emitMock).not.toHaveBeenCalled();
    });

    it("should record stats on game end", async () => {
      mockRepo.recordGameStats.mockImplementation((room: any) => {
        room.statsRecorded = true;
      });
      
      repository.createRoom("ROOM1");
      const room = repository.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.moves.push({ playerId: 100, playerName: "UsedPlayer1", position: "C" });
      room.connections.push({ 
        fromPlayer: { id: 1, name: "Player1", position: "G" },
        toPlayer: { id: 100, name: "UsedPlayer1", position: "C" },
        teamName: "Spurs", 
        seasonYear: 2005 
      } as any);

      repository.endGame("ROOM1", room.players[0], "Test ended");

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockRepo.recordGameStats).toHaveBeenCalled();
      expect(room.statsRecorded).toBe(true);
    }, 10000);

    it("should not record stats twice", async () => {
      mockRepo.recordGameStats.mockResolvedValue(undefined);
      
      repository.createRoom("ROOM1");
      const room = repository.getRoom("ROOM1")!;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.moves.push({ playerId: 100, playerName: "UsedPlayer1", position: "C" });

      repository.endGame("ROOM1", room.players[0], "Test ended");
      repository.endGame("ROOM1", room.players[0], "Test ended again");

      // Wait for async stats recording
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockRepo.recordGameStats).toHaveBeenCalledTimes(1);
    }, 10000);
  });

  describe("clearDisconnectGraceTimer", () => {
    it("should clear pending disconnect timer", () => {
      repository.createRoom("ROOM1");
      const room = repository.getRoom("ROOM1")!;
      room.gameStarted = true;
      room.players.push({ id: 1, name: "Player1", position: "G" } as Player);
      room.players.push({ id: 2, name: "Player2", position: "F" } as Player);

      repository.bindSocket("socket-1", "ROOM1", 1);
      repository.removeSocketBinding("socket-1");
      repository.handleDisconnect("socket-1");

      // Clear the timer
      repository.clearDisconnectGraceTimer("ROOM1", 1);

      // After grace period, player should still be there
      vi.advanceTimersByTime(11000);

      expect(room.players).toHaveLength(2);
    });
  });
});
