import { describe, it, expect, beforeEach, jest, afterEach } from "@jest/globals";
import { Socket } from 'socket.io';
import { GameRoomRepository } from "../../../services/GameRoomRepository";
import { registerGameHandlers } from "../../handlers/game";
import { SubmitMoveRequest, Player, GameRoomState } from "@repo/types";

// Mock socketAuth module
jest.mock("../../../socketAuth", () => ({
  verifySessionToken: jest.fn(),
}));

import { verifySessionToken } from "../../../socketAuth";

const mockVerifySessionToken = verifySessionToken as jest.Mock;

describe("Game Handlers", () => {
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
      on: jest.fn((event: string, handler: Function) => {
        handlers[event] = handler;
      }) as any,
    };

    mockRoomRepository = {
      getRoom: jest.fn(),
      getSocketBinding: jest.fn(),
      submitMove: jest.fn(),
      switchTurn: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
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
      expect(mockSocket.emit).toHaveBeenCalledWith('game_error', 'Invalid session token.');
    });

    it("should reject token for wrong room", async () => {
      mockVerifySessionToken.mockReturnValueOnce({ roomId: 'OTHER_ROOM', playerId: mockPlayerId });

      const submitMoveHandler = handlers['submit_move'];
      await submitMoveHandler({
        roomId: mockRoomId,
        connectedPlayer: mockConnectedPlayer,
        playerToken: mockToken,
      } as SubmitMoveRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('game_error', 'Invalid session token.');
    });

    it("should reject when socket binding doesn't match", async () => {
      mockVerifySessionToken.mockReturnValueOnce({ roomId: mockRoomId, playerId: mockPlayerId });
      (mockRoomRepository.getSocketBinding as jest.Mock).mockReturnValueOnce({
        roomId: 'WRONG_ROOM',
        playerId: 999,
      });

      const submitMoveHandler = handlers['submit_move'];
      await submitMoveHandler({
        roomId: mockRoomId,
        connectedPlayer: mockConnectedPlayer,
        playerToken: mockToken,
      } as SubmitMoveRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('game_error', 'Socket identity does not match session.');
    });

    it("should reject when room doesn't exist", async () => {
      mockVerifySessionToken.mockReturnValueOnce({ roomId: mockRoomId, playerId: mockPlayerId });
      (mockRoomRepository.getSocketBinding as jest.Mock).mockReturnValueOnce({
        roomId: mockRoomId,
        playerId: mockPlayerId,
      });
      (mockRoomRepository.getRoom as jest.Mock).mockReturnValueOnce(undefined);

      const submitMoveHandler = handlers['submit_move'];
      await submitMoveHandler({
        roomId: mockRoomId,
        connectedPlayer: mockConnectedPlayer,
        playerToken: mockToken,
      } as SubmitMoveRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('game_error', 'Game is not active.');
    });

    it("should reject when game is already completed", async () => {
      mockVerifySessionToken.mockReturnValueOnce({ roomId: mockRoomId, playerId: mockPlayerId });
      (mockRoomRepository.getSocketBinding as jest.Mock).mockReturnValueOnce({
        roomId: mockRoomId,
        playerId: mockPlayerId,
      });
      const completedRoom = {
        roomId: mockRoomId,
        gameCompleted: true,
        players: [],
      } as GameRoomState;
      (mockRoomRepository.getRoom as jest.Mock).mockReturnValueOnce(completedRoom);

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
      (mockRoomRepository.getSocketBinding as jest.Mock).mockReturnValueOnce({
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
      (mockRoomRepository.getRoom as jest.Mock).mockReturnValueOnce(room);

      const submitMoveHandler = handlers['submit_move'];
      await submitMoveHandler({
        roomId: mockRoomId,
        connectedPlayer: mockConnectedPlayer,
        playerToken: mockToken,
      } as SubmitMoveRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('game_error', 'Player is not part of this room.');
    });

    it("should reject when it's not the player's turn", async () => {
      mockVerifySessionToken.mockReturnValueOnce({ roomId: mockRoomId, playerId: 1 });
      (mockRoomRepository.getSocketBinding as jest.Mock).mockReturnValueOnce({
        roomId: mockRoomId,
        playerId: 1,
      });
      const room = {
        roomId: mockRoomId,
        gameCompleted: false,
        players: [
          { id: 1, name: 'Player1', position: 'G' } as Player,
          { id: 2, name: 'Player2', position: 'F' } as Player,
        ],
        currentPlayerIndex: 1, // Player 2's turn
        startingPlayer: { id: 50, name: 'Starter', position: 'C' } as Player,
      } as GameRoomState;
      (mockRoomRepository.getRoom as jest.Mock).mockReturnValueOnce(room);

      const submitMoveHandler = handlers['submit_move'];
      await submitMoveHandler({
        roomId: mockRoomId,
        connectedPlayer: mockConnectedPlayer,
        playerToken: mockToken,
      } as SubmitMoveRequest);

      expect(mockSocket.emit).toHaveBeenCalledWith('game_error', "Not your turn.");
      expect(emitMock).toHaveBeenCalledWith('game_error', "Player2's turn.");
    });

    it("should reject when game is not properly initialized", async () => {
      mockVerifySessionToken.mockReturnValueOnce({ roomId: mockRoomId, playerId: 1 });
      (mockRoomRepository.getSocketBinding as jest.Mock).mockReturnValueOnce({
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
      (mockRoomRepository.getRoom as jest.Mock).mockReturnValueOnce(room);

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
      (mockRoomRepository.getSocketBinding as jest.Mock).mockReturnValueOnce({
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
      (mockRoomRepository.getRoom as jest.Mock).mockReturnValueOnce(room);
      (mockRoomRepository.submitMove as jest.Mock).mockResolvedValueOnce({
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
      (mockRoomRepository.getSocketBinding as jest.Mock).mockReturnValueOnce({
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
      (mockRoomRepository.getRoom as jest.Mock).mockReturnValueOnce(room);
      (mockRoomRepository.submitMove as jest.Mock).mockResolvedValueOnce({
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
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockVerifySessionToken.mockReturnValueOnce({ roomId: mockRoomId, playerId: 1 });
      (mockRoomRepository.getSocketBinding as jest.Mock).mockReturnValueOnce({
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
      (mockRoomRepository.getRoom as jest.Mock).mockReturnValueOnce(room);
      (mockRoomRepository.submitMove as jest.Mock).mockRejectedValueOnce(new Error('DB error'));

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
