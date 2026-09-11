import { Server as SocketIOServer } from "socket.io";
import type { MatchEvent, MatchEventSink } from "../services/MatchEngine";

/**
 * Translates MatchEngine domain events into Socket.IO room broadcasts and
 * socket disconnects. The only place in the match flow that knows about
 * Socket.IO.
 */
export class SocketMatchEventSink implements MatchEventSink {
  constructor(private io: SocketIOServer) {}

  publish(event: MatchEvent): void {
    this.io.to(event.roomId).emit(event.type, event.payload);
  }

  disconnectSocket(socketId: string): void {
    this.io.sockets.sockets.get(socketId)?.disconnect(true);
  }
}
