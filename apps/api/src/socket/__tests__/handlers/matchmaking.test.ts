import { describe, it, expect, beforeEach, jest, afterEach } from "@jest/globals";
import { Socket } from 'socket.io';
import { GameRoomRepository } from "../../../services/GameRoomRepository";
import { registerMatchmakingHandlers } from "../../handlers/matchmaking";
import { JoinMatchmakingRequest, GameRoomState, Player } from "@repo/types";

// Mock socketAuth module
jest.mock("../../../socketAuth", () => ({
  normalizePlayerName: jest.fn((name: string) => name.trim()),
  MAX_PLAYER_NAME_LENGTH: 32,
  generatePlayerId: jest.fn(() => 12345),
  issueSessionToken: jest.fn(() => "mock-token"),
}));

import { normalizePlayerName, issueSessionToken } from "../../../socketAuth";

const mockNormalizePlayerName = normalizePlayerName as jest.Mock;
const mockIssueSessionToken = issueSessionToken as jest.Mock;

describe("Matchmaking Handlers", () => {
  let mockSocket: Partial<Socket>;
  let mockRoomRepository: Partial<GameRoomRepository>;
  let emitMock: jest.Mock;
  let toMock: jest.Mock;
  let handlers: Record<string, Function> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    handlers = {};
    emitMock = jest.fn();
    toMock = jest.fn(() => ({ emit: emitMock }));

    mockSocket = {
      id: 'socket-123',
      emit: emitMock,
      to: toMock,
      join: jest.fn(),
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
      findAvailablePublicRoom: jest.fn(),
      getRoom: jest.fn(),
      bindSocket: jest.fn(),
      startGame: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const setupHandlers = () => {
    registerMatchmakingHandlers(mockSocket as Socket, mockRoomRepository as GameRoomRepository);
  };

  describe("join_matchmaking event", () => {
    const mockPlayerName = 'TestPlayer';

    beforeEach(() => {
      mockNormalizePlayerName.mockReturnValue(mockPlayerName);
      setupHandlers();
    });

    it("should reject empty or invalid player names", async () => {
      mockNormalizePlayerName.mockReturnValueOnce('');

      const joinMatchmakingHandler = handlers['join_matchmaking'];
      await joinMatchmakingHandler({ playerName: '' } as JoinMatchmakingRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('matchmaking_result', {
        success: false,
        message: 'Name is required and must be 32 characters or fewer.',
        joinedExisting: false,
      });
    });

    it("should reject player names exceeding max length", async () => {
      const longName = 'a'.repeat(33);
      mockNormalizePlayerName.mockReturnValueOnce(longName);

      const joinMatchmakingHandler = handlers['join_matchmaking'];
      await joinMatchmakingHandler({ playerName: longName } as JoinMatchmakingRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('matchmaking_result', {
        success: false,
        message: 'Name is required and must be 32 characters or fewer.',
        joinedExisting: false,
      });
    });

    it("should create new room when no available public room exists", async () => {
      (mockRoomRepository.findAvailablePublicRoom as jest.Mock).mockReturnValueOnce(null);
      const newRoom = {
        roomId: expect.stringMatching(/^[A-Z0-9]{6}$/),
        players: [],
        friendsOnly: false,
      };
      (mockRoomRepository.createRoom as jest.Mock).mockReturnValue(newRoom);
      (mockRoomRepository.getRoom as jest.Mock).mockReturnValue(newRoom);

      const joinMatchmakingHandler = handlers['join_matchmaking'];
      await joinMatchmakingHandler({ playerName: mockPlayerName } as JoinMatchmakingRequest);

      expect(mockRoomRepository.createRoom).toHaveBeenCalledWith(
        expect.stringMatching(/^[A-Z0-9]{6}$/),
        false
      );
    });

    it("should join existing public room when available", async () => {
      const existingRoomId = 'EXIST123';
      const existingRoom = {
        roomId: existingRoomId,
        players: [{ id: 1, name: 'ExistingPlayer', position: 'G' } as Player],
      };
      (mockRoomRepository.findAvailablePublicRoom as jest.Mock).mockReturnValueOnce(existingRoomId);
      (mockRoomRepository.getRoom as jest.Mock).mockReturnValue(existingRoom);

      const joinMatchmakingHandler = handlers['join_matchmaking'];
      await joinMatchmakingHandler({ playerName: mockPlayerName } as JoinMatchmakingRequest);

      expect(mockRoomRepository.findAvailablePublicRoom).toHaveBeenCalledWith(mockPlayerName);
      expect(mockRoomRepository.createRoom).not.toHaveBeenCalled();
    });

    it("should skip public rooms when friendsOnly is true", async () => {
      (mockRoomRepository.findAvailablePublicRoom as jest.Mock).mockReturnValueOnce('PUBLIC123');
      const newRoom = {
        roomId: 'NEW123',
        players: [],
        friendsOnly: true,
      };
      (mockRoomRepository.createRoom as jest.Mock).mockReturnValue(newRoom);
      (mockRoomRepository.getRoom as jest.Mock).mockReturnValue(newRoom);

      const joinMatchmakingHandler = handlers['join_matchmaking'];
      await joinMatchmakingHandler({
        playerName: mockPlayerName,
        friendsOnly: true,
      } as JoinMatchmakingRequest);

      expect(mockRoomRepository.findAvailablePublicRoom).not.toHaveBeenCalled();
      expect(mockRoomRepository.createRoom).toHaveBeenCalledWith(
        expect.any(String),
        true
      );
    });

    it("should reject joining full room with different player name", async () => {
      const roomId = 'FULL123';
      const fullRoom = {
        roomId,
        players: [
          { id: 1, name: 'Player1', position: 'G' } as Player,
          { id: 2, name: 'Player2', position: 'F' } as Player,
        ],
      };
      (mockRoomRepository.findAvailablePublicRoom as jest.Mock).mockReturnValueOnce(roomId);
      (mockRoomRepository.getRoom as jest.Mock).mockReturnValue(fullRoom);

      const joinMatchmakingHandler = handlers['join_matchmaking'];
      await joinMatchmakingHandler({ playerName: 'NewPlayer' } as JoinMatchmakingRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('matchmaking_result', {
        success: false,
        message: 'Room is full.',
        joinedExisting: true, // Was trying to join existing
      });
    });

    it("should reject duplicate player names in room", async () => {
      const roomId = 'SAME123';
      const roomWithSameName = {
        roomId,
        players: [{ id: 1, name: 'TestPlayer', position: 'G' } as Player],
      };
      (mockRoomRepository.findAvailablePublicRoom as jest.Mock).mockReturnValueOnce(roomId);
      (mockRoomRepository.getRoom as jest.Mock).mockReturnValue(roomWithSameName);

      const joinMatchmakingHandler = handlers['join_matchmaking'];
      await joinMatchmakingHandler({ playerName: 'testplayer' } as JoinMatchmakingRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('matchmaking_result', {
        success: false,
        message: 'That name is already in use for this room.',
        joinedExisting: true,
      });
    });

    it("should successfully create room and add player", async () => {
      (mockRoomRepository.findAvailablePublicRoom as jest.Mock).mockReturnValueOnce(null);
      const newRoom = {
        roomId: 'NEW123',
        players: [],
        friendsOnly: false,
      };
      (mockRoomRepository.createRoom as jest.Mock).mockReturnValue(newRoom);
      (mockRoomRepository.getRoom as jest.Mock).mockReturnValue(newRoom);

      const joinMatchmakingHandler = handlers['join_matchmaking'];
      await joinMatchmakingHandler({ playerName: mockPlayerName } as JoinMatchmakingRequest);

      // Capture the actual room ID from the function call
      const createdRoomId = (mockRoomRepository.createRoom as jest.Mock).mock.calls[0][0];

      expect(mockSocket.join).toHaveBeenCalledWith(createdRoomId);
      expect(newRoom.players).toHaveLength(1);
      expect(newRoom.players[0].name).toBe(mockPlayerName);
      expect(mockRoomRepository.bindSocket).toHaveBeenCalledWith('socket-123', createdRoomId, 12345);
      expect(mockIssueSessionToken).toHaveBeenCalledWith(createdRoomId, 12345);
      expect(emitMock).toHaveBeenCalledWith('player_connected', expect.any(Object));
      expect(emitMock).toHaveBeenCalledWith('room_updated', newRoom);
      expect(mockSocket.emit).toHaveBeenCalledWith('matchmaking_result', {
        success: true,
        message: expect.stringContaining('Created and joined'),
        roomId: createdRoomId,
        roomState: newRoom,
        joinedExisting: false,
        playerToken: 'mock-token',
        playerId: 12345,
      });
    });

    it("should successfully join existing room", async () => {
      const existingRoomId = 'EXIST123';
      const existingRoom = {
        roomId: existingRoomId,
        players: [{ id: 1, name: 'ExistingPlayer', position: 'G' } as Player],
      };
      (mockRoomRepository.findAvailablePublicRoom as jest.Mock).mockReturnValueOnce(existingRoomId);
      (mockRoomRepository.getRoom as jest.Mock).mockReturnValue(existingRoom);

      const joinMatchmakingHandler = handlers['join_matchmaking'];
      await joinMatchmakingHandler({ playerName: mockPlayerName } as JoinMatchmakingRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('matchmaking_result', expect.objectContaining({
        success: true,
        message: expect.stringContaining('Joined existing'),
        joinedExisting: true,
      }));
    });

    it("should emit player info to other players in room", async () => {
      const existingRoomId = 'EXIST123';
      const existingRoom = {
        roomId: existingRoomId,
        players: [{ id: 1, name: 'ExistingPlayer', position: 'G' } as Player],
      };
      (mockRoomRepository.findAvailablePublicRoom as jest.Mock).mockReturnValueOnce(existingRoomId);
      (mockRoomRepository.getRoom as jest.Mock).mockReturnValue(existingRoom);

      const joinMatchmakingHandler = handlers['join_matchmaking'];
      await joinMatchmakingHandler({ playerName: mockPlayerName } as JoinMatchmakingRequest);

      expect(emitMock).toHaveBeenCalledWith('player_connected', expect.objectContaining({
        name: mockPlayerName,
        id: 12345,
        position: 'G',
        socketId: 'socket-123',
      }));
    });

    it("should start game after successful join", async () => {
      const newRoom = {
        roomId: 'NEW123',
        players: [],
        friendsOnly: false,
      };
      (mockRoomRepository.findAvailablePublicRoom as jest.Mock).mockReturnValueOnce(null);
      (mockRoomRepository.createRoom as jest.Mock).mockReturnValue(newRoom);
      (mockRoomRepository.getRoom as jest.Mock).mockReturnValue(newRoom);

      const joinMatchmakingHandler = handlers['join_matchmaking'];
      await joinMatchmakingHandler({ playerName: mockPlayerName } as JoinMatchmakingRequest);

      const createdRoomId = (mockRoomRepository.createRoom as jest.Mock).mock.calls[0][0];
      expect(mockRoomRepository.startGame).toHaveBeenCalledWith(createdRoomId);
    });

    it("should default friendsOnly to false when not specified", async () => {
      const newRoom = {
        roomId: 'NEW123',
        players: [],
        friendsOnly: false,
      };
      (mockRoomRepository.findAvailablePublicRoom as jest.Mock).mockReturnValueOnce(null);
      (mockRoomRepository.createRoom as jest.Mock).mockReturnValue(newRoom);
      (mockRoomRepository.getRoom as jest.Mock).mockReturnValue(newRoom);

      const joinMatchmakingHandler = handlers['join_matchmaking'];
      await joinMatchmakingHandler({ playerName: mockPlayerName } as JoinMatchmakingRequest);

      expect(mockRoomRepository.createRoom).toHaveBeenCalledWith(
        expect.any(String),
        false
      );
    });
  });
});
