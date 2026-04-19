import { Socket } from 'socket.io';
import { JoinMatchmakingRequest, JoinMatchmakingResponse, Player } from '@repo/types';
import { GameRoomRepository } from '../../services/GameRoomRepository';
import { normalizePlayerName, MAX_PLAYER_NAME_LENGTH, generatePlayerId, issueSessionToken } from '../../socketAuth';

export function registerMatchmakingHandlers(
  socket: Socket,
  roomRepository: GameRoomRepository
): void {
  socket.on('join_matchmaking', async (data: JoinMatchmakingRequest) => {
    const normalizedName = normalizePlayerName(data.playerName ?? '');
    const friendsOnly = data.friendsOnly ?? false;
    
    if (!normalizedName || normalizedName.length > MAX_PLAYER_NAME_LENGTH) {
      socket.emit('matchmaking_result', {
        success: false,
        message: `Name is required and must be ${MAX_PLAYER_NAME_LENGTH} characters or fewer.`,
        joinedExisting: false,
      });
      return;
    }

    let selectedRoomId: string | null = null;
    let joinedExisting = false;

    if (!friendsOnly) {
      selectedRoomId = roomRepository.findAvailablePublicRoom(normalizedName);
      if (selectedRoomId) {
        joinedExisting = true;
      }
    }

    if (!selectedRoomId) {
      selectedRoomId = generateRoomId();
      roomRepository.createRoom(selectedRoomId, friendsOnly);
    }

    const room = roomRepository.getRoom(selectedRoomId)!;
    
    if (room.players.length >= 2 && !room.players.some(player => player.name.toLowerCase() === normalizedName.toLowerCase())) {
      socket.emit('matchmaking_result', {
        success: false,
        message: 'Room is full.',
        joinedExisting,
      });
      return;
    }

    if (room.players.some(player => player.name.toLowerCase() === normalizedName.toLowerCase())) {
      socket.emit('matchmaking_result', {
        success: false,
        message: 'That name is already in use for this room.',
        joinedExisting,
      });
      return;
    }

    socket.join(selectedRoomId);

    const player: Player = {
      id: generatePlayerId(room),
      name: normalizedName,
      position: 'G',
      socketId: socket.id
    };
    room.players.push(player);
    roomRepository.bindSocket(socket.id, selectedRoomId, player.id);
    const playerToken = issueSessionToken(selectedRoomId, player.id);

    socket.to(selectedRoomId).emit('player_connected', player);
    socket.to(selectedRoomId).emit('room_updated', room);

    const response: JoinMatchmakingResponse = {
      success: true,
      message: joinedExisting
        ? `Joined existing room ${selectedRoomId}`
        : `Created and joined room ${selectedRoomId}`,
      roomId: selectedRoomId,
      roomState: room,
      joinedExisting,
      playerToken,
      playerId: player.id,
    };

    socket.emit('matchmaking_result', response);
    await roomRepository.startGame(selectedRoomId);
  });
}

function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
