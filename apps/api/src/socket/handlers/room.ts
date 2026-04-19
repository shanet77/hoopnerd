import { Socket } from 'socket.io';
import { JoinRoomRequest, LeaveRoomRequest, Player } from '@repo/types';
import { GameRoomRepository } from '../../services/GameRoomRepository';
import { normalizePlayerName, MAX_PLAYER_NAME_LENGTH, generatePlayerId, issueSessionToken, verifySessionToken } from '../../socketAuth';

export function registerRoomHandlers(
  socket: Socket,
  roomRepository: GameRoomRepository
): void {
  socket.on('create_room', (friendsOnly: boolean = false) => {
    const roomId = generateRoomId();
    roomRepository.createRoom(roomId, friendsOnly);
    socket.emit('room_created', { success: true, message: `Room ${roomId} created successfully`, roomId });
  });

  socket.on('join_room', async (data: JoinRoomRequest) => {
    const { roomId, playerToken } = data;
    const normalizedName = normalizePlayerName(data.playerName ?? '');
    
    if (!normalizedName || normalizedName.length > MAX_PLAYER_NAME_LENGTH) {
      socket.emit('room_joined', {
        success: false,
        message: `Name is required and must be ${MAX_PLAYER_NAME_LENGTH} characters or fewer.`,
      });
      return;
    }

    const room = roomRepository.getOrCreateRoom(roomId);
    socket.join(roomId);

    let player: Player | undefined;
    
    if (playerToken) {
      const claims = verifySessionToken(playerToken);
      if (!claims || claims.roomId !== roomId) {
        socket.emit('room_joined', { success: false, message: 'Invalid session token.' });
        return;
      }
      player = room.players.find(existingPlayer => existingPlayer.id === claims.playerId);
      if (!player) {
        socket.emit('room_joined', { success: false, message: 'Session is no longer valid for this room.' });
        return;
      }
    } else {
      if (room.players.length >= 2) {
        socket.emit('room_joined', { success: false, message: 'Room is full.' });
        return;
      }
      if (room.players.some(existingPlayer => existingPlayer.name.toLowerCase() === normalizedName.toLowerCase())) {
        socket.emit('room_joined', { success: false, message: 'That name is already in use for this room.' });
        return;
      }

      player = { id: generatePlayerId(room), name: normalizedName, position: 'G', socketId: socket.id };
      room.players.push(player);
      socket.to(roomId).emit('player_connected', player);
    }

    player.socketId = socket.id;
    roomRepository.bindSocket(socket.id, roomId, player.id);
    const newSessionToken = issueSessionToken(roomId, player.id);

    socket.to(roomId).emit('room_updated', room);
    socket.emit('room_joined', {
      success: true,
      message: `Successfully joined room ${roomId}`,
      roomState: room,
      playerToken: newSessionToken,
      playerId: player.id,
    });
    
    await roomRepository.startGame(roomId);
  });

  socket.on('leave_room', (data: LeaveRoomRequest) => {
    const { roomId, playerToken } = data;
    
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

    socket.leave(roomId);
    roomRepository.removeSocketBinding(socket.id);
    roomRepository.clearDisconnectGraceTimer(roomId, claims.playerId);
    roomRepository.removePlayerFromRoom(roomId, claims.playerId, 'left');
  });
}

function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
