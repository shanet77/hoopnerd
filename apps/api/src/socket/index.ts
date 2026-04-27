import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { GameRoomRepository } from '../services/GameRoomRepository';
import { registerRoomHandlers } from './handlers/room';
import { registerMatchmakingHandlers } from './handlers/matchmaking';
import { registerGameHandlers } from './handlers/game';

/**
 * Creates and configures a Socket.io server attached to the given HTTP server.
 */
export function createSocketIOServer(
  httpServer: HttpServer,
  allowedOrigins: string[]
): SocketIOServer {
  return new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
      methods: ['GET', 'POST', 'OPTIONS'],
    },
  });
}

/**
 * Registers all socket event handlers for a new connection.
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
