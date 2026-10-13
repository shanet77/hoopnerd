import type { GameRoomState, Player, SoloRunState } from "./index";

export const buildTestPlayer = (overrides: Partial<Player> = {}): Player => ({
  id: overrides.id ?? 1,
  name: overrides.name ?? "Test Player",
  position: overrides.position ?? "G",
  socketId: overrides.socketId,
  isCpu: overrides.isCpu ?? false,
});

export const buildTestRoom = (
  roomId: string = "ROOM1",
  overrides: Partial<GameRoomState> = {},
): GameRoomState => ({
  roomId,
  players: overrides.players ?? [],
  moves: overrides.moves ?? [],
  currentPlayerIndex: overrides.currentPlayerIndex ?? 0,
  gameStarted: overrides.gameStarted ?? false,
  gameCompleted: overrides.gameCompleted ?? false,
  winner: overrides.winner ?? null,
  startingPlayer: overrides.startingPlayer ?? null,
  connections: overrides.connections ?? [],
  lastConnectedPlayer: overrides.lastConnectedPlayer ?? null,
  friendsOnly: overrides.friendsOnly ?? false,
  statsRecorded: overrides.statsRecorded ?? false,
});

export const buildTestSoloRun = (
  runId: string = "SOLO1",
  overrides: Partial<SoloRunState> = {},
): SoloRunState => ({
  ...buildTestRoom(runId, overrides),
  gameStarted: overrides.gameStarted ?? true,
  userId: overrides.userId ?? "user-1",
  displayName: overrides.displayName ?? "Test Runner",
  endReason: overrides.endReason,
});
