import type { SoloEndReason, SoloRunState } from "@repo/types";
import type {
  GameStateRepository,
  PlayersRepository,
  SoloRepository,
} from "@repo/database";

export interface SoloMoveOutcome {
  success: boolean;
  message: string;
  move?: SoloRunState["moves"][number];
  connection?: SoloRunState["connections"][number] | null;
  streak?: number;
  ended?: boolean;
  endReason?: SoloEndReason;
  personalBest?: number;
  isNewBest?: boolean;
}

export interface SoloRunOutcome {
  success: boolean;
  message: string;
  streak: number;
  endReason?: SoloEndReason;
  personalBest?: number;
  isNewBest?: boolean;
}

export interface SoloRunEntry {
  run: SoloRunState;
  startedAt: Date;
  lastActivityAt: number;
  endRecorded: boolean;
  pending: boolean;
}

export interface SoloEngineDependencies {
  players: PlayersRepository;
  gameStates: GameStateRepository;
  solo: SoloRepository;
  idleTtlMs?: number;
  sweepIntervalMs?: number;
}
