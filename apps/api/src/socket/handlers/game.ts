import { Socket } from 'socket.io';
import { SubmitMoveRequest } from '@repo/types';
import { GameRoomRepository } from '../../services/GameRoomRepository';
import { verifySessionToken } from '../../socketAuth';

export function registerGameHandlers(
  socket: Socket,
  roomRepository: GameRoomRepository
): void {
  socket.on('submit_move', async (data: SubmitMoveRequest) => {
    const { roomId, connectedPlayer, playerToken } = data;
    
    const claims = verifySessionToken(playerToken);
    if (!claims || claims.roomId !== roomId) {
      socket.emit('game_error', 'Invalid session token.');
      return;
    }

    const socketBinding = roomRepository.getSocketBinding(socket.id);
    if (
      !socketBinding
      || socketBinding.roomId !== roomId
      || socketBinding.playerId !== claims.playerId
    ) {
      socket.emit('game_error', 'Socket identity does not match session.');
      return;
    }

    const room = roomRepository.getRoom(roomId);
    if (!room || room.gameCompleted) {
      socket.emit('game_error', 'Game is not active.');
      socket.to(roomId).emit('game_error', 'Game is not active.');
      return;
    }

    const requestingPlayer = room.players.find(player => player.id === claims.playerId);
    if (!requestingPlayer) {
      socket.emit('game_error', 'Player is not part of this room.');
      return;
    }

    const currentPlayerTurn = room.players[room.currentPlayerIndex];
    if (currentPlayerTurn.id !== requestingPlayer.id) {
      socket.emit('game_error', 'Not your turn.');
      socket.to(roomId).emit('game_error', `${currentPlayerTurn.name}'s turn.`);
      return;
    }

    if (!room.startingPlayer) {
      socket.emit('game_error', 'Game not properly initialized.');
      socket.to(roomId).emit('game_error', 'Game not properly initialized.');
      return;
    }

    try {
      const result = await roomRepository.submitMove(roomId, claims.playerId, connectedPlayer);

      if (!result.success) {
        socket.emit('move_submitted', { success: false, message: result.message });
        socket.to(roomId).emit('move_submitted', { 
          success: false, 
          message: result.message,
          errorPlayer: result.errorPlayer,
          expectedPlayer: result.expectedPlayer
        });
        socket.to(roomId).emit('room_updated', room);
        return;
      }

      socket.to(roomId).emit('move_submitted', {
        success: true,
        message: result.message,
        roomState: room
      });
      socket.to(roomId).emit('room_updated', room);
      roomRepository.switchTurn(roomId);
    } catch (error) {
      console.error('Error validating move:', error);
      socket.emit('game_error', 'Error validating move');
      socket.to(roomId).emit('game_error', 'Error validating move');
    }
  });
}
