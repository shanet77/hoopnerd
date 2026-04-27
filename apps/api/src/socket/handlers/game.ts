import { Socket } from 'socket.io';
import { SubmitMoveRequest } from '@repo/types';
import { GameRoomRepository } from '../../services/GameRoomRepository';
import {
  AuthenticatedSocket,
  composeMiddlewares,
  requireSession,
  requireRoomAccess,
  requireCurrentTurn,
} from '../middleware/auth';
import { handleErrorOnSocket, HandleErrorOnSocketOptions } from '../middleware/validation';

const GAME_HANDLER_OPTIONS: HandleErrorOnSocketOptions = {
  defaultEvent: 'game_error',
  legacyChannel: 'game_error',
};

export function registerGameHandlers(
  socket: Socket,
  roomRepository: GameRoomRepository
): void {
  // Pre-compose middleware pipeline (created once, not per-event)
  const requireValidSubmit = composeMiddlewares(
    requireSession((d) => d.playerToken),
    requireRoomAccess(roomRepository),
    requireCurrentTurn(roomRepository)
  );

  // ---------------------------------------------------------------------------
  // submit_move
  // ---------------------------------------------------------------------------
  socket.on('submit_move', async (data: SubmitMoveRequest) => {
    const { roomId, connectedPlayer } = data;

    requireValidSubmit(socket, data, async (error, _result) => {
      if (error) {
        handleErrorOnSocket(socket, error, GAME_HANDLER_OPTIONS);
        return;
      }

      const authSocket = socket as AuthenticatedSocket;
      const room = authSocket.room!;

      // Game-internal pre-checks that are not covered by middleware
      if (room.gameCompleted) {
        socket.emit('game_error', 'Game is not active.');
        socket.to(roomId).emit('game_error', 'Game is not active.');
        return;
      }

      if (!room.startingPlayer) {
        socket.emit('game_error', 'Game not properly initialized.');
        socket.to(roomId).emit('game_error', 'Game not properly initialized.');
        return;
      }

      try {
        const result = await roomRepository.submitMove(roomId, authSocket.player!.id, connectedPlayer);

        if (!result.success) {
          socket.emit('move_submitted', { success: false, message: result.message });
          socket.to(roomId).emit('move_submitted', {
            success: false,
            message: result.message,
            errorPlayer: result.errorPlayer,
            expectedPlayer: result.expectedPlayer,
          });
          socket.to(roomId).emit('room_updated', room);
          return;
        }

        socket.to(roomId).emit('move_submitted', {
          success: true,
          message: result.message,
          roomState: room,
        });
        socket.to(roomId).emit('room_updated', room);
        roomRepository.switchTurn(roomId);
      } catch (err) {
        console.error('Error validating move:', err);
        socket.emit('game_error', 'Error validating move');
        socket.to(roomId).emit('game_error', 'Error validating move');
      }
    });
  });
}
