import type {
  CpuDifficulty,
  GameRoomState,
  PersistedMatchGame,
  Player,
} from "@repo/types";
import type {
  GameStateRepository,
  PlayersRepository,
  StatsRepository,
} from "@repo/database";
import { CpuEngine } from "./CpuEngine";
import { createGameRoom, hasPlayerBeenUsed } from "../serverUtils";
import { generatePlayerId } from "../socketAuth";
import { SocketBindingManager, SocketBinding } from "./SocketBindingManager";
import { recordGameStats } from "./StatsRecorder";

export type { SocketBinding } from "./SocketBindingManager";

const CPU_THINKING_DELAY_MS = { min: 800, max: 2000 };
const CPU_PLAYER_NAME = "BronBot";
const DEFAULT_LOBBY_IDLE_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export interface MoveOutcome {
  success: boolean;
  message: string;
  roomState?: GameRoomState;
  errorPlayer?: string;
  expectedPlayer?: string;
}

export type MatchEvent =
  | { type: "game_started"; roomId: string; payload: GameRoomState }
  | { type: "turn_changed"; roomId: string; payload: Player }
  | {
      type: "game_over";
      roomId: string;
      payload: { winner: Player | null; reason: string };
    }
  | { type: "move_submitted"; roomId: string; payload: MoveOutcome }
  | { type: "room_updated"; roomId: string; payload: GameRoomState }
  | { type: "player_disconnected"; roomId: string; payload: string }
  | { type: "cpu_thinking"; roomId: string; payload?: undefined }
  | { type: "game_error"; roomId: string; payload: string };

export interface MatchEventSink {
  publish(event: MatchEvent): void;
  disconnectSocket(socketId: string): void;
}

export interface MatchEngineDependencies {
  repository: PlayersRepository & GameStateRepository & StatsRepository;
  sink: MatchEventSink;
  cpuEngine?: CpuEngine;
  turnTimeoutMs?: number;
  disconnectGraceMs?: number;
  lobbyTtlMs?: number;
  sweepIntervalMs?: number;
}

export class MatchEngine {
  private gameRooms = new Map<string, GameRoomState>();
  private roomTimers = new Map<string, NodeJS.Timeout>();
  private cpuGames = new Map<
    string,
    { cpuPlayer: Player; difficulty: CpuDifficulty }
  >();
  private socketBindings: SocketBindingManager;
  private readonly turnTimeoutMs: number;
  private readonly lobbyIdleTtlMs: number;
  private readonly sweeper: NodeJS.Timeout;
  private roomActivity = new Map<string, number>();
  private persistQueue = new Map<string, Promise<void>>();

  constructor(private deps: MatchEngineDependencies) {
    this.turnTimeoutMs =
      deps.turnTimeoutMs ?? (Number(process.env.TURN_TIMEOUT_MS) || 25000);
    this.lobbyIdleTtlMs =
      deps.lobbyTtlMs ??
      (Number(process.env.ROOM_IDLE_TTL_MS) || DEFAULT_LOBBY_IDLE_TTL_MS);
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
    let records;
    try {
      records =
        await this.deps.repository.loadGameStates<PersistedMatchGame>("match");
    } catch (error) {
      console.error("[MatchEngine] Failed to load persisted rooms:", error);
      return;
    }

    const now = Date.now();
    for (const record of records) {
      const snapshot = record.state;
      const room = snapshot?.room;
      const staleLobby =
        !!room &&
        !room.gameStarted &&
        now - record.updatedAt.getTime() > this.lobbyIdleTtlMs;
      const unusable =
        !snapshot ||
        snapshot.version !== 1 ||
        !room ||
        room.gameCompleted ||
        (room.gameStarted && room.players.length < 2) ||
        (!!snapshot.cpuDifficulty && !this.deps.cpuEngine);

      if (unusable || staleLobby) {
        await this.deps.repository.deleteGameState("match", record.id);
        continue;
      }

      const restoredRoom: GameRoomState = {
        ...room,
        players: room.players.map(({ socketId: _socketId, ...player }) => player),
      };
      this.gameRooms.set(record.id, restoredRoom);
      this.roomActivity.set(record.id, record.updatedAt.getTime());

      if (snapshot.cpuDifficulty) {
        const cpuPlayer = restoredRoom.players.find((player) => player.isCpu);
        if (cpuPlayer) {
          this.cpuGames.set(record.id, {
            cpuPlayer,
            difficulty: snapshot.cpuDifficulty,
          });
        }
      }

      if (restoredRoom.gameStarted) {
        this.startTurnTimer(record.id);
      }
    }
  }

  stop(): void {
    clearInterval(this.sweeper);
    for (const timer of this.roomTimers.values()) {
      clearTimeout(timer);
    }
    this.roomTimers.clear();
  }

  private persistRoom(roomId: string): Promise<void> {
    const room = this.gameRooms.get(roomId);
    if (!room) {
      return this.deletePersisted(roomId);
    }

    this.roomActivity.set(roomId, Date.now());
    const cpuGame = this.cpuGames.get(roomId);
    const snapshot: PersistedMatchGame = {
      version: 1,
      room,
      ...(cpuGame ? { cpuDifficulty: cpuGame.difficulty } : {}),
    };

    return this.queuePersistence(roomId, () =>
      this.deps.repository.saveGameState("match", roomId, snapshot),
    );
  }

  private deletePersisted(roomId: string): Promise<void> {
    return this.queuePersistence(roomId, () =>
      this.deps.repository.deleteGameState("match", roomId),
    );
  }

  private queuePersistence(
    roomId: string,
    task: () => Promise<void>,
  ): Promise<void> {
    const previous = this.persistQueue.get(roomId) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(task)
      .catch((error) => {
        console.error(
          `[MatchEngine] Failed to persist room ${roomId}:`,
          error,
        );
      });
    const next = run.finally(() => {
      if (this.persistQueue.get(roomId) === next) {
        this.persistQueue.delete(roomId);
      }
    });
    this.persistQueue.set(roomId, next);
    return next;
  }

  private destroyRoom(roomId: string): void {
    const timer = this.roomTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.roomTimers.delete(roomId);
    }
    this.gameRooms.delete(roomId);
    this.cpuGames.delete(roomId);
    this.roomActivity.delete(roomId);
    void this.deletePersisted(roomId);
  }

  private evictIdleLobbies(): void {
    const cutoff = Date.now() - this.lobbyIdleTtlMs;
    for (const [roomId, room] of this.gameRooms.entries()) {
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

  createRoom(roomId: string, friendsOnly = false): GameRoomState {
    const room = createGameRoom(roomId, friendsOnly);
    this.gameRooms.set(roomId, room);
    void this.persistRoom(roomId);
    return room;
  }

  getRoom(roomId: string): GameRoomState | undefined {
    return this.gameRooms.get(roomId);
  }

  getOrCreateRoom(roomId: string): GameRoomState {
    let room = this.gameRooms.get(roomId);
    if (!room) {
      room = createGameRoom(roomId);
      this.gameRooms.set(roomId, room);
      void this.persistRoom(roomId);
    }
    return room;
  }

  async saveRoom(roomId: string): Promise<void> {
    await this.persistRoom(roomId);
  }

  findAvailablePublicRoom(excludeName?: string): string | null {
    for (const [roomId, room] of this.gameRooms.entries()) {
      if (
        !room.friendsOnly &&
        room.players.length < 2 &&
        !room.gameStarted &&
        !room.players.some(
          (player) =>
            excludeName &&
            player.name.toLowerCase() === excludeName.toLowerCase(),
        )
      ) {
        return roomId;
      }
    }
    return null;
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
    const room = this.createRoom(roomId, false);

    if (seasonYearMin !== undefined && seasonYearMax !== undefined) {
      room.seasonYearMin = seasonYearMin;
      room.seasonYearMax = seasonYearMax;
    }

    const cpuPlayer: Player = {
      id: generatePlayerId(room),
      name: CPU_PLAYER_NAME,
      position: "C",
      isCpu: true,
    };

    const humanPlayer: Player = {
      id: generatePlayerId(room),
      name: humanPlayerName,
      position: "G",
      socketId: humanSocketId,
    };

    room.players = [humanPlayer, cpuPlayer];
    this.cpuGames.set(roomId, { cpuPlayer, difficulty });
    void this.persistRoom(roomId);

    return { room, humanPlayer, cpuPlayer };
  }

  async start(roomId: string): Promise<boolean> {
    const room = this.gameRooms.get(roomId);
    if (!room || room.players.length < 2 || room.gameStarted) {
      return false;
    }

    room.gameStarted = true;
    room.currentPlayerIndex = Math.floor(Math.random() * room.players.length);

    let startingPlayer: Player | null = null;
    try {
      startingPlayer = await this.deps.repository.getRandomTopScorer(
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
    this.startTurnTimer(roomId);
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
    const room = this.gameRooms.get(roomId);
    if (!room || room.gameCompleted) {
      return this.rejectMove(roomId, room, "Game is not active.");
    }

    if (!room.startingPlayer) {
      return this.rejectMove(roomId, room, "Game not properly initialized.");
    }

    const requestingPlayer = room.players.find(
      (player) => player.id === playerId,
    );
    if (!requestingPlayer) {
      return this.rejectMove(roomId, room, "Player is not part of this room.");
    }

    const currentPlayerTurn = room.players[room.currentPlayerIndex];
    if (!currentPlayerTurn || currentPlayerTurn.id !== requestingPlayer.id) {
      return this.rejectMove(roomId, room, "Not your turn.");
    }

    if (hasPlayerBeenUsed(room, connectedPlayer.id)) {
      return this.rejectMove(
        roomId,
        room,
        `Invalid move! ${connectedPlayer.name} was already used in this game.`,
      );
    }

    if (room.lastConnectedPlayer) {
      const isValidMove = await this.deps.repository.validateMove(
        room.lastConnectedPlayer.id,
        connectedPlayer.id,
        room.seasonYearMin,
        room.seasonYearMax,
      );

      if (!isValidMove) {
        return this.rejectMove(
          roomId,
          room,
          `Invalid connection! ${connectedPlayer.name} did not play with ${room.lastConnectedPlayer.name}`,
          {
            errorPlayer: connectedPlayer.name,
            expectedPlayer: room.lastConnectedPlayer.name,
          },
        );
      }

      const connection = await this.deps.repository.getConnectionDetails(
        room.lastConnectedPlayer.id,
        connectedPlayer.id,
        room.seasonYearMin,
        room.seasonYearMax,
      );
      if (connection) {
        room.connections.push(connection);
      }
    }

    const previousConnectedPlayer = room.lastConnectedPlayer;
    room.moves.push({
      playerId: connectedPlayer.id,
      playerName: connectedPlayer.name,
      position: connectedPlayer.position,
    });
    room.lastConnectedPlayer = connectedPlayer;
    await this.persistRoom(roomId);

    const outcome: MoveOutcome = {
      success: true,
      message: `${connectedPlayer.name} connected to ${previousConnectedPlayer ? "chain" : "start"}!`,
      roomState: room,
    };
    this.publish({ type: "move_submitted", roomId, payload: outcome });
    this.publish({ type: "room_updated", roomId, payload: room });
    this.switchTurn(roomId);
    return outcome;
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

  forfeit(roomId: string, winner: Player | null, reason: string): void {
    const room = this.gameRooms.get(roomId);
    if (!room || room.gameCompleted) return;

    room.gameCompleted = true;
    room.winner = winner;

    const timer = this.roomTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.roomTimers.delete(roomId);
    }

    this.cpuGames.delete(roomId);
    this.publish({
      type: "game_over",
      roomId,
      payload: { winner, reason },
    });
    recordGameStats(this.deps.repository, room)
      .catch((error) => {
        console.error("Error recording stats:", error);
      })
      .finally(() => this.deletePersisted(roomId));
  }

  removePlayer(
    roomId: string,
    playerId: number,
    reason: "left" | "disconnected",
  ): void {
    const room = this.gameRooms.get(roomId);
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

  private switchTurn(roomId: string): void {
    const room = this.gameRooms.get(roomId);
    if (!room) return;

    room.currentPlayerIndex =
      (room.currentPlayerIndex + 1) % room.players.length;
    this.publish({
      type: "turn_changed",
      roomId,
      payload: room.players[room.currentPlayerIndex],
    });
    this.startTurnTimer(roomId);
  }

  private startTurnTimer(roomId: string): void {
    const existing = this.roomTimers.get(roomId);
    if (existing) {
      clearTimeout(existing);
      this.roomTimers.delete(roomId);
    }

    const room = this.gameRooms.get(roomId);
    if (!room || room.gameCompleted) return;

    const currentPlayer = room.players[room.currentPlayerIndex];
    if (currentPlayer?.isCpu) {
      void this.runCpuTurn(roomId, currentPlayer, room);
      return;
    }

    const timer = setTimeout(() => {
      const activeRoom = this.gameRooms.get(roomId);
      if (activeRoom && activeRoom.players.length > 1) {
        const winner =
          activeRoom.players[
            (activeRoom.currentPlayerIndex + 1) % activeRoom.players.length
          ];
        this.forfeit(roomId, winner, "Opponent timed out.");
      }
    }, this.turnTimeoutMs);

    this.roomTimers.set(roomId, timer);
  }

  /**
   * Bot decision loop. Internal to the engine — no socket involvement and no
   * separate service to wire up. On any invalid/no-move/error condition the
   * bot forfeits to the human rather than hanging the match.
   */
  private async runCpuTurn(
    roomId: string,
    cpuPlayer: Player,
    roomState: GameRoomState,
  ): Promise<void> {
    const game = this.cpuGames.get(roomId);
    if (!game || !this.deps.cpuEngine) return;

    try {
      this.publish({ type: "cpu_thinking", roomId });

      const lastPlayer =
        roomState.lastConnectedPlayer || roomState.startingPlayer;
      if (!lastPlayer) {
        this.forfeit(roomId, cpuPlayer, "Game state error — no last player.");
        return;
      }

      const usedPlayerIds = new Set<number>();
      if (roomState.startingPlayer) {
        usedPlayerIds.add(roomState.startingPlayer.id);
      }
      for (const move of roomState.moves) {
        usedPlayerIds.add(move.playerId);
      }

      const delay =
        Math.random() *
          (CPU_THINKING_DELAY_MS.max - CPU_THINKING_DELAY_MS.min) +
        CPU_THINKING_DELAY_MS.min;

      const [chosenPlayer] = await Promise.all([
        this.deps.cpuEngine.getBestMove(
          lastPlayer,
          Array.from(usedPlayerIds),
          game.difficulty,
          roomState.seasonYearMin,
          roomState.seasonYearMax,
        ),
        new Promise<void>((resolve) => setTimeout(resolve, delay)),
      ]);

      if (!chosenPlayer) {
        this.forfeitToHuman(
          roomId,
          cpuPlayer,
          "CPU has no valid moves! You win!",
        );
        return;
      }

      const outcome = await this.applyMove(roomId, cpuPlayer.id, chosenPlayer);
      if (!outcome.success) {
        this.forfeitToHuman(
          roomId,
          cpuPlayer,
          "CPU made an invalid move — you win!",
        );
      }
    } catch (error) {
      console.error(
        `[MatchEngine] Error executing CPU turn in room ${roomId}:`,
        error,
      );
      this.forfeitToHuman(
        roomId,
        cpuPlayer,
        "CPU encountered an error — you win!",
      );
    }
  }

  private forfeitToHuman(
    roomId: string,
    cpuPlayer: Player,
    reason: string,
  ): void {
    const room = this.gameRooms.get(roomId);
    if (!room || room.gameCompleted) return;
    const humanPlayer = room.players.find((player) => !player.isCpu);
    this.forfeit(roomId, humanPlayer ?? cpuPlayer, reason);
  }
}
