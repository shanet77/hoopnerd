import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { Socket } from 'socket.io';
import { GameRoomRepository } from "../../../services/GameRoomRepository";
import { registerRoomHandlers } from "../../handlers/room";
import { JoinRoomRequest, LeaveRoomRequest, GameRoomState } from "@repo/types";

// Mock socketAuth module
jest.mock("../../../socketAuth", () => ({
  normalizePlayerName: jest.fn((name: string) => name.trim()),
  MAX_PLAYER_NAME_LENGTH: 32,
  generatePlayerId: jest.fn(() => 12345),
  issueSessionToken: jest.fn(() => "mock-token"),
  verifySessionToken: jest.fn(),
}));

import { normalizePlayerName, verifySessionToken, issueSessionToken } from "../../../socketAuth";

const mockNormalizePlayerName = normalizePlayerName as jest.Mock;
const mockVerifySessionToken = verifySessionToken as jest.Mock;
const mockIssueSessionToken = issueSessionToken as jest.Mock;

describe("Room Handlers", () => {
  let mockSocket: Partial<Socket>;
  let mockRoomRepository: Partial<GameRoomRepository>;
  let emitMock: jest.Mock;
  let toMock: jest.Mock;
  let leaveMock: jest.Mock;
  let joinMock: jest.Mock;
  let handlers: Record<string, Function> = {};

  beforeEach(() => {
    jest.clearAllMocks(); // Use clearAllMocks instead of resetAllMocks to preserve mock implementations
    handlers = {};
    emitMock = jest.fn();
    toMock = jest.fn(() => ({ emit: emitMock }));
    leaveMock = jest.fn();
    joinMock = jest.fn();

    mockSocket = {
      id: 'socket-123',
      emit: emitMock,
      to: toMock,
      join: joinMock,
      leave: leaveMock,
      on: jest.fn((event: string, handler: Function) => {
        handlers[event] = handler;
      }) as any,
    };

    mockRoomRepository = {
      createRoom: jest.fn((roomId: string) => ({
        roomId,
        players: [],
        gameStarted: false,
        friendsOnly: false,
      } as GameRoomState)),
      getOrCreateRoom: jest.fn(),
      bindSocket: jest.fn(),
      getSocketBinding: jest.fn(),
      removeSocketBinding: jest.fn(),
      removePlayerFromRoom: jest.fn(),
      clearDisconnectGraceTimer: jest.fn(),
      startGame: jest.fn(),
    };
  });

  describe("create_room event", () => {
    beforeEach(() => {
      registerRoomHandlers(mockSocket as Socket, mockRoomRepository as GameRoomRepository);
    });

    it("should create a room and emit success", () => {
      (mockRoomRepository.createRoom as jest.Mock).mockImplementation((id: string) => ({
        roomId: id,
        players: [],
        gameStarted: false,
      }));

      const createRoomHandler = handlers['create_room'];
      createRoomHandler(false);

      expect(mockRoomRepository.createRoom).toHaveBeenCalledWith(
        expect.stringMatching(/^[A-Z0-9]{6}$/),
        false
      );
      expect(mockSocket.emit).toHaveBeenCalledWith('room_created', {
        success: true,
        message: expect.stringContaining('created successfully'),
        roomId: expect.any(String),
      });
    });

    it("should create friends-only room when specified", () => {
      const createRoomHandler = handlers['create_room'];
      createRoomHandler(true);

      expect(mockRoomRepository.createRoom).toHaveBeenCalledWith(
        expect.any(String),
        true
      );
    });

    it("should default to friendsOnly=false when no argument provided", () => {
      const createRoomHandler = handlers['create_room'];
      createRoomHandler();

      expect(mockRoomRepository.createRoom).toHaveBeenCalledWith(
        expect.any(String),
        false
      );
    });
  });

  describe("join_room event", () => {
    const mockRoomId = 'ABC123';
    const mockPlayerName = 'TestPlayer';

    beforeEach(() => {
      mockNormalizePlayerName.mockReturnValue(mockPlayerName);
      registerRoomHandlers(mockSocket as Socket, mockRoomRepository as GameRoomRepository);
    });

    it("should reject empty or invalid player names", async () => {
      mockNormalizePlayerName.mockReturnValueOnce('');

      const joinRoomHandler = handlers['join_room'];
      await joinRoomHandler({ roomId: mockRoomId, playerName: '' } as JoinRoomRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('room_joined', {
        success: false,
        message: 'Name is required and must be 32 characters or fewer.',
      });
    });

    it("should reject player names exceeding max length", async () => {
      const longName = 'a'.repeat(33);
      mockNormalizePlayerName.mockReturnValueOnce(longName);

      const joinRoomHandler = handlers['join_room'];
      await joinRoomHandler({ roomId: mockRoomId, playerName: longName } as JoinRoomRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('room_joined', {
        success: false,
        message: 'Name is required and must be 32 characters or fewer.',
      });
    });

    it("should verify session token when provided", async () => {
      mockVerifySessionToken.mockReturnValueOnce({ roomId: 'WRONG_ROOM', playerId: 1 });

      const joinRoomHandler = handlers['join_room'];
      await joinRoomHandler({
        roomId: mockRoomId,
        playerName: mockPlayerName,
        playerToken: 'invalid-token',
      } as JoinRoomRequest);

      expect(mockVerifySessionToken).toHaveBeenCalledWith('invalid-token');
      expect(mockSocket.emit).toHaveBeenCalledWith('room_joined', {
        success: false,
        message: 'Invalid session token.',
      });
    });

    it("should reject token for wrong room", async () => {
      mockVerifySessionToken.mockReturnValueOnce({ roomId: 'OTHER_ROOM', playerId: 1 });

      const joinRoomHandler = handlers['join_room'];
      await joinRoomHandler({
        roomId: mockRoomId,
        playerName: mockPlayerName,
        playerToken: 'valid-token',
      } as JoinRoomRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('room_joined', {
        success: false,
        message: 'Invalid session token.',
      });
    });

    it("should reject session when player not found in room", async () => {
      mockVerifySessionToken.mockReturnValueOnce({ roomId: mockRoomId, playerId: 999 });
      const mockRoom = {
        roomId: mockRoomId,
        players: [{ id: 1, name: 'OtherPlayer' }],
      };
      (mockRoomRepository.getOrCreateRoom as jest.Mock).mockReturnValue(mockRoom);

      const joinRoomHandler = handlers['join_room'];
      await joinRoomHandler({
        roomId: mockRoomId,
        playerName: mockPlayerName,
        playerToken: 'valid-token',
      } as JoinRoomRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('room_joined', {
        success: false,
        message: 'Session is no longer valid for this room.',
      });
    });

    it("should reject joining full room without valid token", async () => {
      const mockRoom = {
        roomId: mockRoomId,
        players: [
          { id: 1, name: 'Player1' },
          { id: 2, name: 'Player2' },
        ],
      };
      (mockRoomRepository.getOrCreateRoom as jest.Mock).mockReturnValue(mockRoom);

      const joinRoomHandler = handlers['join_room'];
      await joinRoomHandler({
        roomId: mockRoomId,
        playerName: 'NewPlayer',
      } as JoinRoomRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('room_joined', {
        success: false,
        message: 'Room is full.',
      });
    });

    it("should reject duplicate player names", async () => {
      const mockRoom = {
        roomId: mockRoomId,
        players: [{ id: 1, name: 'TestPlayer' }],
      };
      (mockRoomRepository.getOrCreateRoom as jest.Mock).mockReturnValue(mockRoom);

      const joinRoomHandler = handlers['join_room'];
      await joinRoomHandler({
        roomId: mockRoomId,
        playerName: 'testplayer',
      } as JoinRoomRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('room_joined', {
        success: false,
        message: 'That name is already in use for this room.',
      });
    });

    it("should add new player to room successfully", async () => {
      // No need to mock verifySessionToken since no playerToken is provided
      const mockRoom = {
        roomId: mockRoomId,
        players: [],
      };
      (mockRoomRepository.getOrCreateRoom as jest.Mock).mockReturnValue(mockRoom);

      const joinRoomHandler = handlers['join_room'];
      await joinRoomHandler({
        roomId: mockRoomId,
        playerName: mockPlayerName,
      } as JoinRoomRequest);

      expect(mockSocket.join).toHaveBeenCalledWith(mockRoomId);
      expect(mockRoom.players).toHaveLength(1);
      expect(mockRoom.players[0].name).toBe(mockPlayerName);
      expect(mockRoomRepository.bindSocket).toHaveBeenCalledWith(
        'socket-123',
        mockRoomId,
        12345
      );
      expect(mockIssueSessionToken).toHaveBeenCalledWith(mockRoomId, 12345);
      expect(emitMock).toHaveBeenCalledWith('player_connected', expect.any(Object));
      expect(emitMock).toHaveBeenCalledWith('room_updated', mockRoom);
      expect(mockSocket.emit).toHaveBeenCalledWith('room_joined', {
        success: true,
        message: expect.stringContaining('Successfully joined'),
        roomState: mockRoom,
        playerToken: 'mock-token',
        playerId: 12345,
      });
      expect(mockRoomRepository.startGame).toHaveBeenCalledWith(mockRoomId);
    });

    it("should restore existing player session with valid token", async () => {
      const existingPlayer = { id: 5, name: 'TestPlayer', socketId: 'old-socket' };
      // Override default mock for this test
      mockVerifySessionToken.mockReturnValueOnce({ roomId: mockRoomId, playerId: 5 });
      const mockRoom = {
        roomId: mockRoomId,
        players: [existingPlayer],
      };
      (mockRoomRepository.getOrCreateRoom as jest.Mock).mockReturnValue(mockRoom);

      const joinRoomHandler = handlers['join_room'];
      await joinRoomHandler({
        roomId: mockRoomId,
        playerName: mockPlayerName,
        playerToken: 'valid-token',
      } as JoinRoomRequest);

      expect(existingPlayer.socketId).toBe('socket-123');
      expect(mockRoomRepository.bindSocket).toHaveBeenCalledWith('socket-123', mockRoomId, 5);
    });
  });

  describe("leave_room event", () => {
    const mockRoomId = 'ABC123';

    beforeEach(() => {
      registerRoomHandlers(mockSocket as Socket, mockRoomRepository as GameRoomRepository);
    });

    it("should reject invalid session token", () => {
      mockVerifySessionToken.mockReturnValueOnce(null);

      const leaveRoomHandler = handlers['leave_room'];
      leaveRoomHandler({ roomId: mockRoomId, playerToken: 'invalid' } as LeaveRoomRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('game_error', 'Invalid session token.');
    });

    it("should reject token for wrong room", () => {
      mockVerifySessionToken.mockReturnValueOnce({ roomId: 'OTHER_ROOM', playerId: 1 });

      const leaveRoomHandler = handlers['leave_room'];
      leaveRoomHandler({ roomId: mockRoomId, playerToken: 'valid' } as LeaveRoomRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('game_error', 'Invalid session token.');
    });

    it("should reject when socket binding doesn't match", () => {
      mockVerifySessionToken.mockReturnValueOnce({ roomId: mockRoomId, playerId: 1 });
      (mockRoomRepository.getSocketBinding as jest.Mock).mockReturnValueOnce({
        roomId: 'WRONG_ROOM',
        playerId: 999,
      });

      const leaveRoomHandler = handlers['leave_room'];
      leaveRoomHandler({ roomId: mockRoomId, playerToken: 'valid' } as LeaveRoomRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('game_error', 'Socket identity does not match session.');
    });

    it("should successfully leave room when authenticated", () => {
      // Override default mock for this test
      mockVerifySessionToken.mockReturnValueOnce({ roomId: mockRoomId, playerId: 1 });
      (mockRoomRepository.getSocketBinding as jest.Mock).mockReturnValueOnce({
        roomId: mockRoomId,
        playerId: 1,
      });

      const leaveRoomHandler = handlers['leave_room'];
      leaveRoomHandler({ roomId: mockRoomId, playerToken: 'valid' } as LeaveRoomRequest);

      expect(mockSocket.leave).toHaveBeenCalledWith(mockRoomId);
      expect(mockRoomRepository.removeSocketBinding).toHaveBeenCalledWith('socket-123');
      expect(mockRoomRepository.clearDisconnectGraceTimer).toHaveBeenCalledWith(mockRoomId, 1);
      expect(mockRoomRepository.removePlayerFromRoom).toHaveBeenCalledWith(mockRoomId, 1, 'left');
    });
  });
});
