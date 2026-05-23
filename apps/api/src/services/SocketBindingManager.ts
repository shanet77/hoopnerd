import { Server as SocketIOServer } from 'socket.io';

export interface SocketBinding {
  roomId: string;
  playerId: number;
}

export class SocketBindingManager {
  private socketRoomBindings: Map<string, SocketBinding> = new Map();
  private disconnectGraceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly disconnectGracePeriodMs: number;

  constructor(
    private io: SocketIOServer,
    private onDisconnectGraceExpired: (roomId: string, playerId: number) => void,
    disconnectGraceMs?: number
  ) {
    this.disconnectGracePeriodMs =
      disconnectGraceMs ?? (Number(process.env.DISCONNECT_GRACE_MS) || 10000);
  }

  private getDisconnectGraceKey(roomId: string, playerId: number): string {
    return `${roomId}:${playerId}`;
  }

  clearDisconnectGraceTimer(roomId: string, playerId: number): void {
    const key = this.getDisconnectGraceKey(roomId, playerId);
    const timer = this.disconnectGraceTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.disconnectGraceTimers.delete(key);
    }
  }

  bindSocket(socketId: string, roomId: string, playerId: number): void {
    this.clearDisconnectGraceTimer(roomId, playerId);

    for (const [boundSocketId, binding] of this.socketRoomBindings.entries()) {
      if (
        binding.roomId === roomId &&
        binding.playerId === playerId &&
        boundSocketId !== socketId
      ) {
        this.socketRoomBindings.delete(boundSocketId);
        const staleSocket = this.io.sockets.sockets.get(boundSocketId);
        staleSocket?.disconnect(true);
      }
    }

    this.socketRoomBindings.set(socketId, { roomId, playerId });
  }

  getSocketBinding(socketId: string): SocketBinding | undefined {
    return this.socketRoomBindings.get(socketId);
  }

  removeSocketBinding(socketId: string): void {
    this.socketRoomBindings.delete(socketId);
  }

  handleDisconnect(socketId: string): void {
    const binding = this.socketRoomBindings.get(socketId);
    if (binding) {
      this.socketRoomBindings.delete(socketId);
      const { roomId, playerId } = binding;

      this.clearDisconnectGraceTimer(roomId, playerId);

      const key = this.getDisconnectGraceKey(roomId, playerId);
      const timer = setTimeout(() => {
        const stillBound = Array.from(this.socketRoomBindings.values()).some(
          (activeBinding) =>
            activeBinding.roomId === roomId &&
            activeBinding.playerId === playerId
        );

        if (!stillBound) {
          this.onDisconnectGraceExpired(roomId, playerId);
        }

        this.disconnectGraceTimers.delete(key);
      }, this.disconnectGracePeriodMs);

      this.disconnectGraceTimers.set(key, timer);
    }
  }
}
