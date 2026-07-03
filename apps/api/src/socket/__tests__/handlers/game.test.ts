import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Socket } from 'socket.io';
import { GameRoomRepository } from "../../../services/GameRoomRepository";
import { registerGameHandlers } from "../../handlers/game";
import { SubmitMoveRequest, Player, GameRoomState } from "@repo/types";

// Mock socketAuth module
vi.mock("../../../socketAuth", () => ({
  verifySessionToken: vi.fn(),
}));

import { verifySessionToken } from "../../../socketAuth";

const mockVerifySessionToken = verifySessionToken as vi.Mock;

describe("Game Handlers", () => {
  let mockSocket: Partial<Socket>;
  let mockRoomRepository: Partial<GameRoomRepository>;
  let emitMock: vi.Mock;
  let toMock: vi.Mock;
  let handlers: Record<string, Function> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = {};
    emitMock = vi.fn();
    toMock = vi.fn(() => ({ emit: emitMock }));

    mockSocket = {
      id: 'socket-123',
      emit: emitMock,
      to: toMock,
      on: vi.fn((event: string, handler: Function) => {
        handlers[event] = handler;
      }) as any,
    };

    mockRoomRepository = {
      getRoom: vi.fn(),
      getSocketBinding: vi.fn(),
      submitMove: vi.fn(),
      switchTurn: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const setupHandlers = () => {
    registerGameHandlers(mockSocket as Socket, mockRoomRepository as GameRoomRepository);
  };

  describe("submit_move event", () => {
    const mockRoomId = 'ABC123';
    const mockPlayerId = 1;
    const mockToken = 'valid-token';
    const mockConnectedPlayer: Player = { id: 100, name: 'NewPlayer', position: 'C' };

    beforeEach(() => {
      setupHandlers();
    });

    it("should reject invalid session token", async () => {
      mockVerifySessionToken.mockReturnValueOnce(null);

      const submitMoveHandler = handlers['submit_move'];
      await submitMoveHandler({
        roomId: mockRoomId,
        connectedPlayer: mockConnectedPlayer,
        playerToken: 'invalid-token',
      } as SubmitMoveRequest);

      expect(mockVerifySessionToken).toHaveBeenCalledWith('invalid-token');
      expect(mockSocket.emit).toHaveBeenCalledWith('auth_error', {
        code: 'AUTH_001',
        message: 'Invalid session token',
        metadata: undefined,
      });
    });

    it("should reject socket identity mismatch after valid token", async () => {
      mockVerifySessionToken.mockReturnValueOnce({ roomId: 'OTHER_ROOM', playerId: mockPlayerId });

      const submitMoveHandler = handlers['submit_move'];
      await submitMoveHandler({
        roomId: mockRoomId,
        connectedPlayer: mockConnectedPlayer,
        playerToken: mockToken,
      } as SubmitMoveRequest);

      // Middleware runs requireSession first (passes), then requireRoomAccess
      // The socket binding check will fail because the binding doesn't match the token's room
      expect(mockSocket.emit).toHaveBeenCalledWith('auth_error', {
        code: 'AUTH_004',
        message: 'Socket identity does not match session',
        metadata: undefined,
      });
    });

    it("should reject when socket binding doesn't match session", async () => {
      mockVerifySessionToken.mockReturnValueOnce({ roomId: mockRoomId, playerId: mockPlayerId });
      (mockRoomRepository.getSocketBinding as vi.Mock).mockReturnValueOnce({
        roomId: 'WRONG_ROOM',
        playerId: 999,
      });

      const submitMoveHandler = handlers['submit_move'];
      await submitMoveHandler({
        roomId: mockRoomId,
        connectedPlayer: mockConnectedPlayer,
        playerToken: mockToken,
      } as SubmitMoveRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('auth_error', {
        code: 'AUTH_004',
        message: 'Socket identity does not match session',
        metadata: undefined,
      });
    });

    it("should reject when room doesn't exist", async () => {
      mockVerifySessionToken.mockReturnValueOnce({ roomId: mockRoomId, playerId: mockPlayerId });
      (mockRoomRepository.getSocketBinding as vi.Mock).mockReturnValueOnce({
        roomId: mockRoomId,
        playerId: mockPlayerId,
      });
      (mockRoomRepository.getRoom as vi.Mock).mockReturnValueOnce(undefined);

      const submitMoveHandler = handlers['submit_move'];
      await submitMoveHandler({
        roomId: mockRoomId,
        connectedPlayer: mockConnectedPlayer,
        playerToken: mockToken,
      } as SubmitMoveRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('auth_error', {
        code: 'AUTH_006',
        message: 'Room not found',
        metadata: undefined,
      });
    });

    it("should emit game error when game is already completed", async () => {
      mockVerifySessionToken.mockReturnValueOnce({ roomId: mockRoomId, playerId: mockPlayerId });
      (mockRoomRepository.getSocketBinding as vi.Mock).mockReturnValueOnce({
        roomId: mockRoomId,
        playerId: mockPlayerId,
      });
      const player = { id: mockPlayerId, name: 'Player1', position: 'G' };
      const completedRoom = {
        roomId: mockRoomId,
        gameCompleted: true,
        players: [player],
        currentPlayerIndex: 0,
      } as GameRoomState;
      (mockRoomRepository.getRoom as vi.Mock).mockReturnValueOnce(completedRoom);

      const submitMoveHandler = handlers['submit_move'];
      await submitMoveHandler({
        roomId: mockRoomId,
        connectedPlayer: mockConnectedPlayer,
        playerToken: mockToken,
      } as SubmitMoveRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('game_error', 'Game is not active.');
      expect(emitMock).toHaveBeenCalledWith('game_error', 'Game is not active.');
    });

    it("should reject when player is not part of the room", async () => {
      mockVerifySessionToken.mockReturnValueOnce({ roomId: mockRoomId, playerId: 999 });
      (mockRoomRepository.getSocketBinding as vi.Mock).mockReturnValueOnce({
        roomId: mockRoomId,
        playerId: 999,
      });
      const room = {
        roomId: mockRoomId,
        gameCompleted: false,
        players: [
          { id: 1, name: 'Player1', position: 'G' } as Player,
        ],
      } as GameRoomState;
      (mockRoomRepository.getRoom as vi.Mock).mockReturnValueOnce(room);

      const submitMoveHandler = handlers['submit_move'];
      await submitMoveHandler({
        roomId: mockRoomId,
        connectedPlayer: mockConnectedPlayer,
        playerToken: mockToken,
      } as SubmitMoveRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('auth_error', {
        code: 'AUTH_005',
        message: 'Player is not part of this room',
        metadata: undefined,
      });
    });

    it("should reject when it's not the player's turn", async () => {
      mockVerifySessionToken.mockReturnValueOnce({ roomId: mockRoomId, playerId: 1 });
      (mockRoomRepository.getSocketBinding as vi.Mock).mockReturnValueOnce({
        roomId: mockRoomId,
        playerId: 1,
      });
      const player1 = { id: 1, name: 'Player1', position: 'G' } as Player;
      const player2 = { id: 2, name: 'Player2', position: 'F' } as Player;
      const room = {
        roomId: mockRoomId,
        gameCompleted: false,
        players: [player1, player2],
        currentPlayerIndex: 1, // Player 2's turn
        startingPlayer: { id: 50, name: 'Starter', position: 'C' } as Player,
      } as GameRoomState;
      (mockRoomRepository.getRoom as vi.Mock).mockReturnValueOnce(room);

      const submitMoveHandler = handlers['submit_move'];
      await submitMoveHandler({
        roomId: mockRoomId,
        connectedPlayer: mockConnectedPlayer,
        playerToken: mockToken,
      } as SubmitMoveRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('auth_error', {
        code: 'AUTH_007',
        message: 'Not your turn',
        metadata: { currentPlayerName: 'Player2' },
      });
    });

    it("should reject when game is not properly initialized", async () => {
      mockVerifySessionToken.mockReturnValueOnce({ roomId: mockRoomId, playerId: 1 });
      (mockRoomRepository.getSocketBinding as vi.Mock).mockReturnValueOnce({
        roomId: mockRoomId,
        playerId: 1,
      });
      const room = {
        roomId: mockRoomId,
        gameCompleted: false,
        players: [
          { id: 1, name: 'Player1', position: 'G' } as Player,
        ],
        currentPlayerIndex: 0,
        startingPlayer: null, // Not initialized
      } as GameRoomState;
      (mockRoomRepository.getRoom as vi.Mock).mockReturnValueOnce(room);

      const submitMoveHandler = handlers['submit_move'];
      await submitMoveHandler({
        roomId: mockRoomId,
        connectedPlayer: mockConnectedPlayer,
        playerToken: mockToken,
      } as SubmitMoveRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('game_error', 'Game not properly initialized.');
      expect(emitMock).toHaveBeenCalledWith('game_error', 'Game not properly initialized.');
    });

    it("should emit failed move submission when move is invalid", async () => {
      mockVerifySessionToken.mockReturnValueOnce({ roomId: mockRoomId, playerId: 1 });
      (mockRoomRepository.getSocketBinding as vi.Mock).mockReturnValueOnce({
        roomId: mockRoomId,
        playerId: 1,
      });
      const room = {
        roomId: mockRoomId,
        gameCompleted: false,
        players: [
          { id: 1, name: 'Player1', position: 'G' } as Player,
        ],
        currentPlayerIndex: 0,
        startingPlayer: { id: 50, name: 'Starter', position: 'C' } as Player,
      } as GameRoomState;
      (mockRoomRepository.getRoom as vi.Mock).mockReturnValueOnce(room);
      (mockRoomRepository.submitMove as vi.Mock).mockResolvedValueOnce({
        success: false,
        message: 'Invalid connection!',
        errorPlayer: 'NewPlayer',
        expectedPlayer: 'Starter',
      });

      const submitMoveHandler = handlers['submit_move'];
      await submitMoveHandler({
        roomId: mockRoomId,
        connectedPlayer: mockConnectedPlayer,
        playerToken: mockToken,
      } as SubmitMoveRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('move_submitted', {
        success: false,
        message: 'Invalid connection!',
      });
      expect(emitMock).toHaveBeenCalledWith('move_submitted', {
        success: false,
        message: 'Invalid connection!',
        errorPlayer: 'NewPlayer',
        expectedPlayer: 'Starter',
      });
      expect(emitMock).toHaveBeenCalledWith('room_updated', room);
      expect(mockRoomRepository.switchTurn).not.toHaveBeenCalled();
    });

    it("should process valid move and switch turn", async () => {
      mockVerifySessionToken.mockReturnValueOnce({ roomId: mockRoomId, playerId: 1 });
      (mockRoomRepository.getSocketBinding as vi.Mock).mockReturnValueOnce({
        roomId: mockRoomId,
        playerId: 1,
      });
      const room = {
        roomId: mockRoomId,
        gameCompleted: false,
        players: [
          { id: 1, name: 'Player1', position: 'G' } as Player,
        ],
        currentPlayerIndex: 0,
        startingPlayer: { id: 50, name: 'Starter', position: 'C' } as Player,
      } as GameRoomState;
      (mockRoomRepository.getRoom as vi.Mock).mockReturnValueOnce(room);
      (mockRoomRepository.submitMove as vi.Mock).mockResolvedValueOnce({
        success: true,
        message: 'NewPlayer connected to chain!',
      });

      const submitMoveHandler = handlers['submit_move'];
      await submitMoveHandler({
        roomId: mockRoomId,
        connectedPlayer: mockConnectedPlayer,
        playerToken: mockToken,
      } as SubmitMoveRequest);

      expect(emitMock).toHaveBeenCalledWith('move_submitted', {
        success: true,
        message: 'NewPlayer connected to chain!',
        roomState: room,
      });
      expect(emitMock).toHaveBeenCalledWith('room_updated', room);
      expect(mockRoomRepository.switchTurn).toHaveBeenCalledWith(mockRoomId);
    });

    it("should handle errors during move validation", async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation();
      mockVerifySessionToken.mockReturnValueOnce({ roomId: mockRoomId, playerId: 1 });
      (mockRoomRepository.getSocketBinding as vi.Mock).mockReturnValueOnce({
        roomId: mockRoomId,
        playerId: 1,
      });
      const room = {
        roomId: mockRoomId,
        gameCompleted: false,
        players: [
          { id: 1, name: 'Player1', position: 'G' } as Player,
        ],
        currentPlayerIndex: 0,
        startingPlayer: { id: 50, name: 'Starter', position: 'C' } as Player,
      } as GameRoomState;
      (mockRoomRepository.getRoom as vi.Mock).mockReturnValueOnce(room);
      (mockRoomRepository.submitMove as vi.Mock).mockRejectedValueOnce(new Error('DB error'));

      const submitMoveHandler = handlers['submit_move'];
      await submitMoveHandler({
        roomId: mockRoomId,
        connectedPlayer: mockConnectedPlayer,
        playerToken: mockToken,
      } as SubmitMoveRequest);

      expect(consoleSpy).toHaveBeenCalledWith('Error validating move:', expect.any(Error));
      expect(mockSocket.emit).toHaveBeenCalledWith('game_error', 'Error validating move');
      expect(emitMock).toHaveBeenCalledWith('game_error', 'Error validating move');

      consoleSpy.mockRestore();
    });
  });
});
