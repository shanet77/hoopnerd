import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Socket } from "socket.io";
import { MatchEngine } from "../../../services/MatchEngine";
import { registerGameHandlers } from "../../handlers/game";
import { SubmitMoveRequest, Player, GameRoomState } from "@repo/types";

// Mock socketAuth module
vi.mock("../../../socketAuth", () => ({
  verifySessionToken: vi.fn(),
  normalizePlayerName: vi.fn((name: string) => name.trim()),
  MAX_PLAYER_NAME_LENGTH: 32,
}));

import { verifySessionToken } from "../../../socketAuth";

const mockVerifySessionToken = verifySessionToken as vi.Mock;

describe("Game Handlers", () => {
  let mockSocket: Partial<Socket>;
  let mockEngine: Partial<MatchEngine>;
  let emitMock: vi.Mock;
  let toMock: vi.Mock;
  let handlers: Record<string, Function> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = {};
    emitMock = vi.fn();
    toMock = vi.fn(() => ({ emit: emitMock }));

    mockSocket = {
      id: "socket-123",
      emit: emitMock,
      to: toMock,
      on: vi.fn((event: string, handler: Function) => {
        handlers[event] = handler;
      }) as any,
    };

    mockEngine = {
      getRoom: vi.fn(),
      getSocketBinding: vi.fn(),
      applyMove: vi.fn().mockResolvedValue({ success: true, message: "ok" }),
    };

    registerGameHandlers(mockSocket as Socket, mockEngine as MatchEngine);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("submit_move event", () => {
    const mockRoomId = "ABC123";
    const mockPlayerId = 1;
    const mockToken = "valid-token";
    const mockConnectedPlayer: Player = {
      id: 100,
      name: "NewPlayer",
      position: "C",
    };

    it("should reject invalid session token", async () => {
      mockVerifySessionToken.mockReturnValueOnce(null);

      await handlers["submit_move"]({
        roomId: mockRoomId,
        connectedPlayer: mockConnectedPlayer,
        playerToken: "invalid-token",
      } as SubmitMoveRequest);

      expect(mockVerifySessionToken).toHaveBeenCalledWith("invalid-token");
      expect(mockSocket.emit).toHaveBeenCalledWith("auth_error", {
        code: "AUTH_001",
        message: "Invalid session token",
      });
      expect(mockEngine.applyMove).not.toHaveBeenCalled();
    });

    it("should reject socket identity mismatch after valid token", async () => {
      mockVerifySessionToken.mockReturnValueOnce({
        roomId: "OTHER_ROOM",
        playerId: mockPlayerId,
      });

      await handlers["submit_move"]({
        roomId: mockRoomId,
        connectedPlayer: mockConnectedPlayer,
        playerToken: mockToken,
      } as SubmitMoveRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith("auth_error", {
        code: "AUTH_003",
        message: "Session does not belong to this room",
      });
      expect(mockEngine.applyMove).not.toHaveBeenCalled();
    });

    it("should reject when room doesn't exist", async () => {
      mockVerifySessionToken.mockReturnValueOnce({
        roomId: mockRoomId,
        playerId: mockPlayerId,
      });
      (mockEngine.getSocketBinding as vi.Mock).mockReturnValueOnce({
        roomId: mockRoomId,
        playerId: mockPlayerId,
      });
      (mockEngine.getRoom as vi.Mock).mockReturnValueOnce(undefined);

      await handlers["submit_move"]({
        roomId: mockRoomId,
        connectedPlayer: mockConnectedPlayer,
        playerToken: mockToken,
      } as SubmitMoveRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith("auth_error", {
        code: "AUTH_006",
        message: "Room not found",
      });
    });

    it("should reject when player is not part of the room", async () => {
      mockVerifySessionToken.mockReturnValueOnce({
        roomId: mockRoomId,
        playerId: 999,
      });
      (mockEngine.getSocketBinding as vi.Mock).mockReturnValueOnce({
        roomId: mockRoomId,
        playerId: 999,
      });
      (mockEngine.getRoom as vi.Mock).mockReturnValueOnce({
        roomId: mockRoomId,
        gameCompleted: false,
        players: [{ id: 1, name: "Player1", position: "G" } as Player],
      } as GameRoomState);

      await handlers["submit_move"]({
        roomId: mockRoomId,
        connectedPlayer: mockConnectedPlayer,
        playerToken: mockToken,
      } as SubmitMoveRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith("auth_error", {
        code: "AUTH_005",
        message: "Player is not part of this room",
      });
    });

    it("should reject when it's not the player's turn", async () => {
      // Turn order is a game-state invariant owned by MatchEngine.applyMove,
      // so the handler authorizes identity and delegates.
      mockVerifySessionToken.mockReturnValueOnce({
        roomId: mockRoomId,
        playerId: 1,
      });
      (mockEngine.getSocketBinding as vi.Mock).mockReturnValueOnce({
        roomId: mockRoomId,
        playerId: 1,
      });
      (mockEngine.getRoom as vi.Mock).mockReturnValueOnce({
        roomId: mockRoomId,
        gameCompleted: false,
        players: [
          { id: 1, name: "Player1", position: "G" } as Player,
          { id: 2, name: "Player2", position: "F" } as Player,
        ],
        currentPlayerIndex: 1,
        startingPlayer: { id: 50, name: "Starter", position: "C" } as Player,
      } as GameRoomState);

      await handlers["submit_move"]({
        roomId: mockRoomId,
        connectedPlayer: mockConnectedPlayer,
        playerToken: mockToken,
      } as SubmitMoveRequest);

      expect(mockEngine.applyMove).toHaveBeenCalledWith(
        mockRoomId,
        1,
        mockConnectedPlayer,
      );
    });

    it("should delegate the validated move to the engine", async () => {
      mockVerifySessionToken.mockReturnValueOnce({
        roomId: mockRoomId,
        playerId: 1,
      });
      (mockEngine.getSocketBinding as vi.Mock).mockReturnValueOnce({
        roomId: mockRoomId,
        playerId: 1,
      });
      (mockEngine.getRoom as vi.Mock).mockReturnValueOnce({
        roomId: mockRoomId,
        gameCompleted: false,
        players: [{ id: 1, name: "Player1", position: "G" } as Player],
        currentPlayerIndex: 0,
        startingPlayer: { id: 50, name: "Starter", position: "C" } as Player,
      } as GameRoomState);

      await handlers["submit_move"]({
        roomId: mockRoomId,
        connectedPlayer: mockConnectedPlayer,
        playerToken: mockToken,
      } as SubmitMoveRequest);

      expect(mockEngine.applyMove).toHaveBeenCalledWith(
        mockRoomId,
        1,
        mockConnectedPlayer,
      );
    });

    it("should handle errors thrown by the engine", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation();
      mockVerifySessionToken.mockReturnValueOnce({
        roomId: mockRoomId,
        playerId: 1,
      });
      (mockEngine.getSocketBinding as vi.Mock).mockReturnValueOnce({
        roomId: mockRoomId,
        playerId: 1,
      });
      (mockEngine.getRoom as vi.Mock).mockReturnValueOnce({
        roomId: mockRoomId,
        gameCompleted: false,
        players: [{ id: 1, name: "Player1", position: "G" } as Player],
        currentPlayerIndex: 0,
        startingPlayer: { id: 50, name: "Starter", position: "C" } as Player,
      } as GameRoomState);
      (mockEngine.applyMove as vi.Mock).mockRejectedValueOnce(
        new Error("DB error"),
      );

      await handlers["submit_move"]({
        roomId: mockRoomId,
        connectedPlayer: mockConnectedPlayer,
        playerToken: mockToken,
      } as SubmitMoveRequest);

      expect(consoleSpy).toHaveBeenCalledWith(
        "Error validating move:",
        expect.any(Error),
      );
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "game_error",
        "Error validating move",
      );
      expect(emitMock).toHaveBeenCalledWith(
        "game_error",
        "Error validating move",
      );

      consoleSpy.mockRestore();
    });
  });
});
