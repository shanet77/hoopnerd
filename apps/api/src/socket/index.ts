import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import { MatchEngine } from "../services/MatchEngine";
import { registerRoomHandlers } from "./handlers/room";
import { registerMatchmakingHandlers } from "./handlers/matchmaking";
import { registerGameHandlers } from "./handlers/game";
import { registerCpuGameHandlers } from "./handlers/cpu";

/**
 * Creates and configures a Socket.io server attached to the given HTTP server.
 */
export function createSocketIOServer(
  httpServer: HttpServer,
  allowedOrigins: string[],
): SocketIOServer {
  return new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins.includes("*") ? "*" : allowedOrigins,
      methods: ["GET", "POST", "OPTIONS"],
    },
  });
}

/**
 * Registers all socket event handlers for a new connection.
 */
export function registerSocketHandlers(
  io: SocketIOServer,
  matchEngine: MatchEngine,
  socket: Socket,
  cpuEnabled = true,
): void {
  console.log(`User connected: ${socket.id}`);

  // Register all handler modules
  registerRoomHandlers(socket, matchEngine);
  registerMatchmakingHandlers(socket, matchEngine);
  registerGameHandlers(socket, matchEngine);
  if (cpuEnabled) {
    registerCpuGameHandlers(socket, matchEngine);
  }

  // Global disconnect handler
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    matchEngine.handleDisconnect(socket.id);
  });
}

/**
 * Sets up Socket.io with all event handlers.
 */
export function setupSocketIO(
  io: SocketIOServer,
  matchEngine: MatchEngine,
  cpuEnabled = true,
): void {
  io.on("connection", (socket: Socket) => {
    registerSocketHandlers(io, matchEngine, socket, cpuEnabled);
  });
}
