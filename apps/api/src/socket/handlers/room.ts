import { Socket } from 'socket.io';
import { JoinRoomRequest, LeaveRoomRequest, Player } from '@repo/types';
import { GameRoomRepository } from '../../services/GameRoomRepository';
import { normalizePlayerName, MAX_PLAYER_NAME_LENGTH, generatePlayerId, issueSessionToken } from '../../socketAuth';
import {
  AuthenticatedSocket,
  composeMiddlewares,
  requireSessionNoBinding,
  requireRoomAccess,
} from '../middleware/auth';
import { validatePlayerName, handleErrorOnSocket, HandleErrorOnSocketOptions } from '../middleware/validation';

const ROOM_JOIN_OPTIONS: HandleErrorOnSocketOptions = {
  defaultEvent: 'room_joined',
  legacyChannel: 'room_joined',
};

const GAME_HANDLER_OPTIONS: HandleErrorOnSocketOptions = {
  defaultEvent: 'game_error',
  legacyChannel: 'game_error',
};

export function registerRoomHandlers(
  socket: Socket,
  roomRepository: GameRoomRepository
): void {
  // ---------------------------------------------------------------------------
  // create_room
  // ---------------------------------------------------------------------------
  socket.on('create_room', (friendsOnly: boolean = false) => {
    const roomId = generateRoomId();
    roomRepository.createRoom(roomId, friendsOnly);
    socket.emit('room_created', {
      success: true,
      message: `Room ${roomId} created successfully`,
      roomId,
    });
  });

  // ---------------------------------------------------------------------------
  // join_room — dual path: restore session or create new player
  // ---------------------------------------------------------------------------
  socket.on('join_room', async (data: JoinRoomRequest) => {
    const { roomId, playerName, playerToken } = data;

    // --- validation step (shared by both paths) --------------------------------
    const validateNameMiddleware = composeMiddlewares(
      validatePlayerName((d) => d.playerName)
    );

    validateNameMiddleware(socket, data, async (error, result) => {
      if (error) {
        handleErrorOnSocket(socket, error, ROOM_JOIN_OPTIONS);
        return;
      }

      const normalizedName = (result as any).normalizedName;
      const room = roomRepository.getOrCreateRoom(roomId);
      socket.join(roomId);

      // --- path A: restore existing player via session token -----------------
      if (playerToken) {
        const handlerMiddleware = requireSessionNoBinding((d) => d.playerToken);

        handlerMiddleware(socket, data, async (authError) => {
          if (authError) {
            socket.emit('room_joined', {
              success: false,
              message: 'Invalid session token.',
            });
            return;
          }

          const authSocket = socket as AuthenticatedSocket;
          // Find the player in the room using claims from the validated token
          const existingPlayer = room.players.find(
            (p: any) => p.id === authSocket.playerId
          );
          if (!existingPlayer) {
            socket.emit('room_joined', {
              success: false,
              message: 'Session is no longer valid for this room.',
            });
            return;
          }

          // Re-bind and issue fresh token
          existingPlayer.socketId = socket.id;
          roomRepository.bindSocket(socket.id, roomId, existingPlayer.id);
          const newSessionToken = issueSessionToken(roomId, existingPlayer.id);

          socket.to(roomId).emit('room_updated', room);
          socket.emit('room_joined', {
            success: true,
            message: `Successfully joined room ${roomId}`,
            roomState: room,
            playerToken: newSessionToken,
            playerId: existingPlayer.id,
          });

          await roomRepository.startGame(roomId);
        });
        return;
      }

      // --- path B: create new player -----------------------------------------
      if (room.players.length >= 2) {
        socket.emit('room_joined', {
          success: false,
          message: 'Room is full.',
        });
        return;
      }

      const normalizedNameLower = normalizedName.toLowerCase();
      if (room.players.some((p: any) => p.name.toLowerCase() === normalizedNameLower)) {
        socket.emit('room_joined', {
          success: false,
          message: 'That name is already in use for this room.',
        });
        return;
      }

      const player: Player = {
        id: generatePlayerId(room),
        name: normalizedName,
        position: 'G',
        socketId: socket.id,
      };
      room.players.push(player);
      socket.to(roomId).emit('player_connected', player);

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
  });

  // ---------------------------------------------------------------------------
  // leave_room
  // ---------------------------------------------------------------------------
  socket.on('leave_room', (data: LeaveRoomRequest) => {
    const handlerMiddleware = composeMiddlewares(
      requireSession((d) => d.playerToken),
      requireRoomAccess(roomRepository)
    );

    handlerMiddleware(socket, data, async (error, _result) => {
      if (error) {
        handleErrorOnSocket(socket, error, GAME_HANDLER_OPTIONS);
        return;
      }

      const authSocket = socket as AuthenticatedSocket;

      socket.leave(data.roomId);
      roomRepository.removeSocketBinding(socket.id);
      roomRepository.clearDisconnectGraceTimer(data.roomId, authSocket.playerId!);
      roomRepository.removePlayerFromRoom(
        data.roomId,
        authSocket.playerId!,
        'left'
      );
    });
  });
}

function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
