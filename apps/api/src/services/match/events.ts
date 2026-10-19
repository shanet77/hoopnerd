import type { GameRoomState, Player } from "@repo/types";
import type {
  GameStateRepository,
  PlayersRepository,
  StatsRepository,
} from "@repo/database";
import type { CpuEngine } from "../CpuEngine";

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
  players: PlayersRepository;
  stats: StatsRepository;
  gameStates: GameStateRepository;
  sink: MatchEventSink;
  cpuEngine?: CpuEngine;
  turnTimeoutMs?: number;
  disconnectGraceMs?: number;
  lobbyTtlMs?: number;
  sweepIntervalMs?: number;
}
