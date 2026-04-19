import { Server as SocketIOServer, Socket } from 'socket.io';
import { GameRoomRepository } from '../services/GameRoomRepository';
import { registerRoomHandlers } from './handlers/room';
import { registerMatchmakingHandlers } from './handlers/matchmaking';
import { registerGameHandlers } from './handlers/game';

/**
 * Registers all socket event handlers for a new connection.
 * This is Step 1 of the refactoring: Extract handlers to separate modules.
 */
export function registerSocketHandlers(
  io: SocketIOServer,
  roomRepository: GameRoomRepository,
  socket: Socket
): void {
  console.log(`User connected: ${socket.id}`);

  // Register all handler modules
  registerRoomHandlers(socket, roomRepository);
  registerMatchmakingHandlers(socket, roomRepository);
  registerGameHandlers(socket, roomRepository);

  // Global disconnect handler
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    roomRepository.handleDisconnect(socket.id);
  });
}

/**
 * Sets up Socket.io with all event handlers.
 */
export function setupSocketIO(
  io: SocketIOServer,
  roomRepository: GameRoomRepository
): void {
  io.on('connection', (socket: Socket) => {
    registerSocketHandlers(io, roomRepository, socket);
  });
}
