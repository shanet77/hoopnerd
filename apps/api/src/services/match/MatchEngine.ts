import type { CpuDifficulty, GameRoomState, Player } from "@repo/types";
import { SocketBindingManager, SocketBinding } from "../SocketBindingManager";
import { recordGameStats } from "../StatsRecorder";
import { CpuOpponent } from "./CpuOpponent";
import type { MatchEngineDependencies, MatchEvent, MoveOutcome } from "./events";
import { MatchPersistence } from "./MatchPersistence";
import { MatchRules } from "./MatchRules";
import { RoomRegistry } from "./roomRegistry";
import { TurnController } from "./TurnController";

export type { SocketBinding } from "../SocketBindingManager";
export type {
  MatchEngineDependencies,
  MatchEvent,
  MatchEventSink,
  MoveOutcome,
} from "./events";

const DEFAULT_LOBBY_IDLE_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export class MatchEngine {
  private readonly registry = new RoomRegistry();
  private readonly rules: MatchRules;
  private readonly persistence: MatchPersistence;
  private readonly turnController: TurnController;
  private readonly cpuOpponent: CpuOpponent;
  private readonly socketBindings: SocketBindingManager;
  private readonly turnTimeoutMs: number;
  private readonly lobbyIdleTtlMs: number;
  private readonly sweeper: NodeJS.Timeout;
  private roomActivity = new Map<string, number>();

  constructor(private deps: MatchEngineDependencies) {
    this.turnTimeoutMs =
      deps.turnTimeoutMs ?? (Number(process.env.TURN_TIMEOUT_MS) || 25000);
    this.lobbyIdleTtlMs =
      deps.lobbyTtlMs ??
      (Number(process.env.ROOM_IDLE_TTL_MS) || DEFAULT_LOBBY_IDLE_TTL_MS);
    this.rules = new MatchRules(deps.players);
    this.persistence = new MatchPersistence(deps.gameStates);
    this.cpuOpponent = new CpuOpponent({
      cpuEngine: deps.cpuEngine,
      getRoom: (roomId) => this.registry.getRoom(roomId),
      getCpuGame: (roomId) => this.registry.getCpuGame(roomId),
      applyMove: (roomId, playerId, connectedPlayer) =>
        this.applyMove(roomId, playerId, connectedPlayer),
      forfeit: (roomId, winner, reason) => this.forfeit(roomId, winner, reason),
      publish: (event) => this.publish(event),
    });
    this.turnController = new TurnController({
      turnTimeoutMs: this.turnTimeoutMs,
      getRoom: (roomId) => this.registry.getRoom(roomId),
      publish: (event) => this.publish(event),
      forfeit: (roomId, winner, reason) => this.forfeit(roomId, winner, reason),
      runCpuTurn: (roomId, cpuPlayer, room) =>
        void this.cpuOpponent.runCpuTurn(roomId, cpuPlayer, room),
    });
    this.socketBindings = new SocketBindingManager(
      (socketId) => deps.sink.disconnectSocket(socketId),
      (roomId, playerId) => this.removePlayer(roomId, playerId, "disconnected"),
      deps.disconnectGraceMs,
    );
    const sweepIntervalMs = deps.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
    this.sweeper = setInterval(() => this.evictIdleLobbies(), sweepIntervalMs);
    this.sweeper.unref();
  }

  async restore(): Promise<void> {
    await this.persistence.restore(
      {
        lobbyTtlMs: this.lobbyIdleTtlMs,
        hasCpuEngine: !!this.deps.cpuEngine,
        now: Date.now(),
      },
      (roomId, snapshot, updatedAt) => {
        const restoredRoom: GameRoomState = {
          ...snapshot.room,
          players: snapshot.room.players.map(
            ({ socketId: _socketId, ...player }) => player,
          ),
        };
        this.registry.setRoom(roomId, restoredRoom);
        this.roomActivity.set(roomId, updatedAt.getTime());

        if (snapshot.cpuDifficulty) {
          const cpuPlayer = restoredRoom.players.find(
            (player) => player.isCpu,
          );
          if (cpuPlayer) {
            this.registry.setCpuGame(roomId, {
              cpuPlayer,
              difficulty: snapshot.cpuDifficulty,
            });
          }
        }

        if (restoredRoom.gameStarted) {
          this.turnController.startTurnTimer(roomId);
        }
      },
    );
  }

  stop(): void {
    clearInterval(this.sweeper);
    this.turnController.clearAll();
  }

  createRoom(roomId: string, friendsOnly = false): GameRoomState {
    const room = this.registry.createRoom(roomId, friendsOnly);
    void this.persistRoom(roomId);
    return room;
  }

  getRoom(roomId: string): GameRoomState | undefined {
    return this.registry.getRoom(roomId);
  }

  getOrCreateRoom(roomId: string): GameRoomState {
    const existing = this.registry.getRoom(roomId);
    if (existing) return existing;

    const room = this.registry.createRoom(roomId);
    void this.persistRoom(roomId);
    return room;
  }

  async saveRoom(roomId: string): Promise<void> {
    await this.persistRoom(roomId);
  }

  findAvailablePublicRoom(excludeName?: string): string | null {
    return this.registry.findAvailablePublicRoom(excludeName);
  }

  bindSocket(socketId: string, roomId: string, playerId: number): void {
    this.socketBindings.bindSocket(socketId, roomId, playerId);
  }

  getSocketBinding(socketId: string): SocketBinding | undefined {
    return this.socketBindings.getSocketBinding(socketId);
  }

  removeSocketBinding(socketId: string): void {
    this.socketBindings.removeSocketBinding(socketId);
  }

  clearDisconnectGraceTimer(roomId: string, playerId: number): void {
    this.socketBindings.clearDisconnectGraceTimer(roomId, playerId);
  }

  handleDisconnect(socketId: string): void {
    this.socketBindings.handleDisconnect(socketId);
  }

  /**
   * Creates a human-vs-CPU room and registers the bot's difficulty so the
   * engine can drive its turns internally.
   */
  createCpuGame(
    roomId: string,
    humanPlayerName: string,
    difficulty: CpuDifficulty,
    humanSocketId: string,
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): { room: GameRoomState; humanPlayer: Player; cpuPlayer: Player } {
    const created = this.registry.createCpuGame(
      roomId,
      humanPlayerName,
      difficulty,
      humanSocketId,
      seasonYearMin,
      seasonYearMax,
    );
    void this.persistRoom(roomId);
    return created;
  }

  async start(roomId: string): Promise<boolean> {
    const room = this.registry.getRoom(roomId);
    if (!room || room.players.length < 2 || room.gameStarted) {
      return false;
    }

    room.gameStarted = true;
    room.currentPlayerIndex = Math.floor(Math.random() * room.players.length);

    let startingPlayer: Player | null = null;
    try {
      startingPlayer = await this.deps.players.getRandomTopScorer(
        undefined,
        room.seasonYearMin,
        room.seasonYearMax,
      );
    } catch (error) {
      console.error(
        `[MatchEngine] Room ${roomId} — starting-player query failed:`,
        error,
      );
    }

    if (!startingPlayer) {
      room.gameStarted = false;
      this.publish({
        type: "game_error",
        roomId,
        payload: "No players available to start the game.",
      });
      return false;
    }

    room.startingPlayer = startingPlayer;
    room.lastConnectedPlayer = startingPlayer;
    await this.persistRoom(roomId);
    this.publish({ type: "game_started", roomId, payload: room });
    this.turnController.startTurnTimer(roomId);
    return true;
  }

  /**
   * Single validation + progression path for both human and CPU moves.
   * Emits the resulting match events and advances the turn on success.
   */
  async applyMove(
    roomId: string,
    playerId: number,
    connectedPlayer: Player,
  ): Promise<MoveOutcome> {
    const room = this.registry.getRoom(roomId);
    const rejection = this.rules.checkPreconditions(
      room,
      playerId,
      connectedPlayer,
    );
    if (!room || rejection) {
      return this.rejectMove(
        roomId,
        room,
        rejection?.message ?? "Game is not active.",
        rejection
          ? {
              errorPlayer: rejection.errorPlayer,
              expectedPlayer: rejection.expectedPlayer,
            }
          : undefined,
      );
    }

    const resolved = await this.rules.resolveConnection(room, connectedPlayer);
    if ("rejection" in resolved) {
      return this.rejectMove(roomId, room, resolved.rejection.message, {
        errorPlayer: resolved.rejection.errorPlayer,
        expectedPlayer: resolved.rejection.expectedPlayer,
      });
    }
    if (resolved.connection) {
      room.connections.push(resolved.connection);
    }

    const previousConnectedPlayer = this.rules.recordMove(
      room,
      connectedPlayer,
    );
    await this.persistRoom(roomId);

    const outcome: MoveOutcome = {
      success: true,
      message: `${connectedPlayer.name} connected to ${previousConnectedPlayer ? "chain" : "start"}!`,
      roomState: room,
    };
    this.publish({ type: "move_submitted", roomId, payload: outcome });
    this.publish({ type: "room_updated", roomId, payload: room });
    this.turnController.switchTurn(roomId);
    return outcome;
  }

  forfeit(roomId: string, winner: Player | null, reason: string): void {
    const room = this.registry.getRoom(roomId);
    if (!room || room.gameCompleted) return;

    room.gameCompleted = true;
    room.winner = winner;

    this.turnController.clearTimer(roomId);
    this.registry.deleteCpuGame(roomId);
    this.publish({
      type: "game_over",
      roomId,
      payload: { winner, reason },
    });
    recordGameStats(this.deps.stats, room)
      .catch((error) => {
        console.error("Error recording stats:", error);
      })
      .finally(() => this.persistence.delete(roomId));
  }

  removePlayer(
    roomId: string,
    playerId: number,
    reason: "left" | "disconnected",
  ): void {
    const room = this.registry.getRoom(roomId);
    if (!room) return;

    const playerIndex = room.players.findIndex(
      (player) => player.id === playerId,
    );
    if (playerIndex === -1) return;

    const removedPlayer = room.players[playerIndex];
    room.players.splice(playerIndex, 1);
    this.publish({
      type: "player_disconnected",
      roomId,
      payload: removedPlayer.name,
    });

    if (room.gameStarted && !room.gameCompleted && room.players.length < 2) {
      const winner = room.players[0] || null;
      this.forfeit(
        roomId,
        winner,
        reason === "left"
          ? "Opponent left the room."
          : "Opponent disconnected.",
      );
    }

    room.currentPlayerIndex =
      room.players.length > 0
        ? room.currentPlayerIndex % room.players.length
        : 0;
    this.publish({ type: "room_updated", roomId, payload: room });

    if (room.players.length === 0) {
      this.destroyRoom(roomId);
    } else if (!room.gameCompleted) {
      void this.persistRoom(roomId);
    }
  }

  private persistRoom(roomId: string): Promise<void> {
    const room = this.registry.getRoom(roomId);
    if (!room) {
      return this.persistence.delete(roomId);
    }

    this.roomActivity.set(roomId, Date.now());
    const cpuGame = this.registry.getCpuGame(roomId);
    return this.persistence.save(roomId, room, cpuGame?.difficulty);
  }

  private rejectMove(
    roomId: string,
    room: GameRoomState | undefined,
    message: string,
    extra?: { errorPlayer?: string; expectedPlayer?: string },
  ): MoveOutcome {
    const outcome: MoveOutcome = { success: false, message, ...extra };
    this.publish({ type: "move_submitted", roomId, payload: outcome });
    if (room) {
      this.publish({ type: "room_updated", roomId, payload: room });
    }
    return outcome;
  }

  private destroyRoom(roomId: string): void {
    this.turnController.clearTimer(roomId);
    this.registry.deleteRoom(roomId);
    this.roomActivity.delete(roomId);
    void this.persistence.delete(roomId);
  }

  private evictIdleLobbies(): void {
    const cutoff = Date.now() - this.lobbyIdleTtlMs;
    for (const [roomId, room] of this.registry.rooms()) {
      if (room.gameStarted) continue;
      const lastActivity = this.roomActivity.get(roomId) ?? 0;
      if (lastActivity < cutoff) {
        this.destroyRoom(roomId);
      }
    }
  }

  private publish(event: MatchEvent): void {
    this.deps.sink.publish(event);
  }
}
