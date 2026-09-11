import { describe, it, expect, beforeEach, vi } from "vitest";
import { Socket } from "socket.io";
import { MatchEngine } from "../../../services/MatchEngine";
import { registerRoomHandlers } from "../../handlers/room";
import { JoinRoomRequest, LeaveRoomRequest, GameRoomState } from "@repo/types";

// Mock socketAuth module
vi.mock("../../../socketAuth", () => ({
  normalizePlayerName: vi.fn((name: string) => name.trim()),
  MAX_PLAYER_NAME_LENGTH: 32,
  generatePlayerId: vi.fn(() => 12345),
  issueSessionToken: vi.fn(() => "mock-token"),
  verifySessionToken: vi.fn(),
}));

import {
  normalizePlayerName,
  verifySessionToken,
  issueSessionToken,
} from "../../../socketAuth";

const mockNormalizePlayerName = normalizePlayerName as vi.Mock;
const mockVerifySessionToken = verifySessionToken as vi.Mock;
const mockIssueSessionToken = issueSessionToken as vi.Mock;

describe("Room Handlers", () => {
  let mockSocket: Partial<Socket>;
  let mockEngine: Partial<MatchEngine>;
  let emitMock: vi.Mock;
  let toMock: vi.Mock;
  let leaveMock: vi.Mock;
  let joinMock: vi.Mock;
  let handlers: Record<string, Function> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = {};
    emitMock = vi.fn();
    toMock = vi.fn(() => ({ emit: emitMock }));
    leaveMock = vi.fn();
    joinMock = vi.fn();

    mockSocket = {
      id: "socket-123",
      emit: emitMock,
      to: toMock,
      join: joinMock,
      leave: leaveMock,
      on: vi.fn((event: string, handler: Function) => {
        handlers[event] = handler;
      }) as any,
    };

    mockEngine = {
      createRoom: vi.fn(
        (roomId: string) =>
          ({
            roomId,
            players: [],
            gameStarted: false,
            friendsOnly: false,
          }) as GameRoomState,
      ),
      getOrCreateRoom: vi.fn(),
      bindSocket: vi.fn(),
      getSocketBinding: vi.fn(),
      getRoom: vi.fn(),
      removeSocketBinding: vi.fn(),
      removePlayer: vi.fn(),
      clearDisconnectGraceTimer: vi.fn(),
      start: vi.fn(),
    };
  });

  describe("create_room event", () => {
    beforeEach(() => {
      registerRoomHandlers(mockSocket as Socket, mockEngine as MatchEngine);
    });

    it("should create a room and emit success", () => {
      (mockEngine.createRoom as vi.Mock).mockImplementation((id: string) => ({
        roomId: id,
        players: [],
        gameStarted: false,
      }));

      const createRoomHandler = handlers["create_room"];
      createRoomHandler(false);

      expect(mockEngine.createRoom).toHaveBeenCalledWith(
        expect.stringMatching(/^[A-Z0-9]{6}$/),
        false,
      );
      expect(mockSocket.emit).toHaveBeenCalledWith("room_created", {
        success: true,
        message: expect.stringContaining("created successfully"),
        roomId: expect.any(String),
      });
    });

    it("should create friends-only room when specified", () => {
      const createRoomHandler = handlers["create_room"];
      createRoomHandler(true);

      expect(mockEngine.createRoom).toHaveBeenCalledWith(
        expect.any(String),
        true,
      );
    });

    it("should default to friendsOnly=false when no argument provided", () => {
      const createRoomHandler = handlers["create_room"];
      createRoomHandler();

      expect(mockEngine.createRoom).toHaveBeenCalledWith(
        expect.any(String),
        false,
      );
    });
  });

  describe("join_room event", () => {
    const mockRoomId = "ABC123";
    const mockPlayerName = "TestPlayer";

    beforeEach(() => {
      mockNormalizePlayerName.mockReturnValue(mockPlayerName);
      registerRoomHandlers(mockSocket as Socket, mockEngine as MatchEngine);
    });

    it("should reject empty or invalid player names", async () => {
      mockNormalizePlayerName.mockReturnValueOnce("");

      const joinRoomHandler = handlers["join_room"];
      await joinRoomHandler({
        roomId: mockRoomId,
        playerName: "",
      } as JoinRoomRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith("validation_error", {
        code: "INVALID_NAME",
        message: "Name is required and must be 32 characters or fewer.",
      });
    });

    it("should reject player names exceeding max length", async () => {
      const longName = "a".repeat(33);
      mockNormalizePlayerName.mockReturnValueOnce(longName);

      const joinRoomHandler = handlers["join_room"];
      await joinRoomHandler({
        roomId: mockRoomId,
        playerName: longName,
      } as JoinRoomRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith("validation_error", {
        code: "INVALID_NAME",
        message: "Name is required and must be 32 characters or fewer.",
      });
    });

    it("should verify session token when provided", async () => {
      mockVerifySessionToken.mockReturnValueOnce(null);
      const mockRoom = { roomId: mockRoomId, players: [] };
      (mockEngine.getOrCreateRoom as vi.Mock).mockReturnValue(mockRoom);

      const joinRoomHandler = handlers["join_room"];
      await joinRoomHandler({
        roomId: mockRoomId,
        playerName: mockPlayerName,
        playerToken: "invalid-token",
      } as JoinRoomRequest);

      expect(mockVerifySessionToken).toHaveBeenCalledWith("invalid-token");
      expect(mockSocket.emit).toHaveBeenCalledWith("room_joined", {
        success: false,
        message: "Invalid session token.",
      });
    });

    it("should reject session when player not found in room", async () => {
      mockVerifySessionToken.mockReturnValueOnce({
        roomId: mockRoomId,
        playerId: 999,
      });
      const mockRoom = {
        roomId: mockRoomId,
        players: [{ id: 1, name: "OtherPlayer" }],
      };
      (mockEngine.getOrCreateRoom as vi.Mock).mockReturnValue(mockRoom);

      const joinRoomHandler = handlers["join_room"];
      await joinRoomHandler({
        roomId: mockRoomId,
        playerName: mockPlayerName,
        playerToken: "valid-token",
      } as JoinRoomRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith("room_joined", {
        success: false,
        message: "Session is no longer valid for this room.",
      });
    });

    it("should reject joining full room without valid token", async () => {
      const mockRoom = {
        roomId: mockRoomId,
        players: [
          { id: 1, name: "Player1" },
          { id: 2, name: "Player2" },
        ],
      };
      (mockEngine.getOrCreateRoom as vi.Mock).mockReturnValue(mockRoom);

      const joinRoomHandler = handlers["join_room"];
      await joinRoomHandler({
        roomId: mockRoomId,
        playerName: "NewPlayer",
      } as JoinRoomRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith("room_joined", {
        success: false,
        message: "Room is full.",
      });
    });

    it("should reject duplicate player names", async () => {
      const mockRoom = {
        roomId: mockRoomId,
        players: [{ id: 1, name: "TestPlayer" }],
      };
      (mockEngine.getOrCreateRoom as vi.Mock).mockReturnValue(mockRoom);

      const joinRoomHandler = handlers["join_room"];
      await joinRoomHandler({
        roomId: mockRoomId,
        playerName: "testplayer",
      } as JoinRoomRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith("room_joined", {
        success: false,
        message: "That name is already in use for this room.",
      });
    });

    it("should add new player to room successfully", async () => {
      // No need to mock verifySessionToken since no playerToken is provided
      const mockRoom = {
        roomId: mockRoomId,
        players: [],
      };
      (mockEngine.getOrCreateRoom as vi.Mock).mockReturnValue(mockRoom);

      const joinRoomHandler = handlers["join_room"];
      await joinRoomHandler({
        roomId: mockRoomId,
        playerName: mockPlayerName,
      } as JoinRoomRequest);

      expect(mockSocket.join).toHaveBeenCalledWith(mockRoomId);
      expect(mockRoom.players).toHaveLength(1);
      expect(mockRoom.players[0].name).toBe(mockPlayerName);
      expect(mockEngine.bindSocket).toHaveBeenCalledWith(
        "socket-123",
        mockRoomId,
        12345,
      );
      expect(mockIssueSessionToken).toHaveBeenCalledWith(mockRoomId, 12345);
      expect(emitMock).toHaveBeenCalledWith(
        "player_connected",
        expect.any(Object),
      );
      expect(emitMock).toHaveBeenCalledWith("room_updated", mockRoom);
      expect(mockSocket.emit).toHaveBeenCalledWith("room_joined", {
        success: true,
        message: expect.stringContaining("Successfully joined"),
        roomState: mockRoom,
        playerToken: "mock-token",
        playerId: 12345,
      });
      expect(mockEngine.start).toHaveBeenCalledWith(mockRoomId);
    });

    it("should restore existing player session with valid token", async () => {
      const existingPlayer = {
        id: 5,
        name: "TestPlayer",
        socketId: "old-socket",
      };
      mockVerifySessionToken.mockReturnValueOnce({
        roomId: mockRoomId,
        playerId: 5,
      });
      const mockRoom = {
        roomId: mockRoomId,
        players: [existingPlayer],
      };
      (mockEngine.getOrCreateRoom as vi.Mock).mockReturnValue(mockRoom);

      const joinRoomHandler = handlers["join_room"];
      await joinRoomHandler({
        roomId: mockRoomId,
        playerName: mockPlayerName,
        playerToken: "valid-token",
      } as JoinRoomRequest);

      expect(existingPlayer.socketId).toBe("socket-123");
      expect(mockEngine.bindSocket).toHaveBeenCalledWith(
        "socket-123",
        mockRoomId,
        5,
      );
    });
  });

  describe("leave_room event", () => {
    const mockRoomId = "ABC123";

    beforeEach(() => {
      registerRoomHandlers(mockSocket as Socket, mockEngine as MatchEngine);
    });

    it("should reject invalid session token", async () => {
      mockVerifySessionToken.mockReturnValueOnce(null);

      const leaveRoomHandler = handlers["leave_room"];
      await leaveRoomHandler({
        roomId: mockRoomId,
        playerToken: "invalid",
      } as LeaveRoomRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith("auth_error", {
        code: "AUTH_001",
        message: "Invalid session token",
        metadata: undefined,
      });
    });

    it("should reject token for wrong room", async () => {
      mockVerifySessionToken.mockReturnValueOnce({
        roomId: "OTHER_ROOM",
        playerId: 1,
      });

      const leaveRoomHandler = handlers["leave_room"];
      await leaveRoomHandler({
        roomId: mockRoomId,
        playerToken: "valid",
      } as LeaveRoomRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith("auth_error", {
        code: "AUTH_004",
        message: "Socket identity does not match session",
        metadata: undefined,
      });
    });

    it("should reject when socket binding doesn't match", async () => {
      mockVerifySessionToken.mockReturnValueOnce({
        roomId: mockRoomId,
        playerId: 1,
      });
      (mockEngine.getSocketBinding as vi.Mock).mockReturnValueOnce({
        roomId: "WRONG_ROOM",
        playerId: 999,
      });

      const leaveRoomHandler = handlers["leave_room"];
      await leaveRoomHandler({
        roomId: mockRoomId,
        playerToken: "valid",
      } as LeaveRoomRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith("auth_error", {
        code: "AUTH_004",
        message: "Socket identity does not match session",
        metadata: undefined,
      });
    });

    it("should successfully leave room when authenticated", async () => {
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
        players: [{ id: 1, name: "Player1" }],
      });

      const leaveRoomHandler = handlers["leave_room"];
      await leaveRoomHandler({
        roomId: mockRoomId,
        playerToken: "valid",
      } as LeaveRoomRequest);

      expect(mockSocket.leave).toHaveBeenCalledWith(mockRoomId);
      expect(mockEngine.removeSocketBinding).toHaveBeenCalledWith("socket-123");
      expect(mockEngine.clearDisconnectGraceTimer).toHaveBeenCalledWith(
        mockRoomId,
        1,
      );
      expect(mockEngine.removePlayer).toHaveBeenCalledWith(
        mockRoomId,
        1,
        "left",
      );
    });
  });
});
