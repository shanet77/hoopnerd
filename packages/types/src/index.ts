export interface User {
  id: string;
  username: string;
  friendIds: string[];
}

export interface FriendRelationship {
  userId: string;
  friendId: string;
  createdAt: Date;
}

export type CpuDifficulty = "easy";

export interface Player {
  id: number;
  name: string;
  position: string;
  socketId?: string;
  isCpu?: boolean;
}

// WebSocket Event Types
export interface PlayerMove {
  playerId: number;
  playerName: string;
  position: string;
}

export interface PlayerConnection {
  fromPlayer: Player;
  toPlayer: Player;
  seasonYear?: number;
  teamName?: string;
}

export interface GameRoomState {
  roomId: string;
  players: Player[];
  moves: PlayerMove[];
  currentPlayerIndex: number;
  gameStarted: boolean;
  gameCompleted: boolean;
  winner?: Player | null;
  startingPlayer?: Player | null;
  connections: PlayerConnection[];
  lastConnectedPlayer?: Player | null;
  friendsOnly: boolean;
  statsRecorded?: boolean;
  seasonYearMin?: number;
  seasonYearMax?: number;
}

export interface JoinRoomRequest {
  roomId: string;
  playerName: string;
  playerToken?: string;
}

export interface JoinRoomResponse {
  success: boolean;
  message: string;
  roomState?: GameRoomState;
  playerToken?: string;
  playerId?: number;
}

export interface SubmitMoveRequest {
  roomId: string;
  connectedPlayer: Player;
  playerToken: string;
}

export interface SubmitMoveResponse {
  success: boolean;
  message: string;
  roomState?: GameRoomState;
  validated: boolean;
}

export interface CreateRoomResponse {
  success: boolean;
  message: string;
  roomId: string;
}

export interface JoinMatchmakingRequest {
  playerName: string;
  friendsOnly?: boolean;
}

export interface JoinMatchmakingResponse {
  success: boolean;
  message: string;
  roomId?: string;
  roomState?: GameRoomState;
  joinedExisting: boolean;
  playerToken?: string;
  playerId?: number;
}

export type SoloEndReason = "stuck" | "repeat" | "invalid" | "forfeit";

export interface SoloRunState extends GameRoomState {
  userId: string;
  displayName: string;
  endReason?: SoloEndReason;
}

export interface CreateSoloRunRequest {
  userId: string;
  displayName: string;
  seasonYearMin?: number;
  seasonYearMax?: number;
}

export interface CreateSoloRunResponse {
  success: boolean;
  message: string;
  runState?: SoloRunState;
  runToken?: string;
}

export interface ResumeSoloRunRequest {
  runId: string;
  runToken: string;
}

export interface ResumeSoloRunResponse {
  success: boolean;
  message: string;
  runState?: SoloRunState;
}

export interface SubmitSoloMoveRequest {
  runId: string;
  runToken: string;
  connectedPlayer: Player;
}

export interface SubmitSoloMoveResponse {
  success: boolean;
  message: string;
  move?: PlayerMove;
  connection?: PlayerConnection | null;
  streak?: number;
  ended?: boolean;
  endReason?: SoloEndReason;
  personalBest?: number;
  isNewBest?: boolean;
}

export interface EndSoloRunRequest {
  runId: string;
  runToken: string;
}

export interface EndSoloRunResponse {
  success: boolean;
  message: string;
  streak: number;
  endReason?: SoloEndReason;
  personalBest?: number;
  isNewBest?: boolean;
}

export interface SoloLeaderboardEntry {
  userId: string;
  name: string;
  streak: number;
}

export interface CreateCpuGameRequest {
  playerName: string;
  difficulty: CpuDifficulty;
  seasonYearMin?: number;
  seasonYearMax?: number;
}

export interface CreateCpuGameResponse {
  success: boolean;
  message: string;
  roomId?: string;
  roomState?: GameRoomState;
  playerToken?: string;
  playerId?: number;
}

export interface LeaveRoomRequest {
  roomId: string;
  playerToken: string;
}

export interface WebSocketEvents {
  // Client to Server events
  join_room: (data: JoinRoomRequest) => void;
  join_matchmaking: (data: JoinMatchmakingRequest) => void;
  create_room: (friendsOnly?: boolean) => void;
  create_cpu_game: (data: CreateCpuGameRequest) => void;
  create_solo_run: (data: CreateSoloRunRequest) => void;
  resume_solo_run: (data: ResumeSoloRunRequest) => void;
  submit_solo_move: (data: SubmitSoloMoveRequest) => void;
  end_solo_run: (data: EndSoloRunRequest) => void;
  leave_room: (data: LeaveRoomRequest) => void;
  submit_move: (data: SubmitMoveRequest) => void;

  // Server to Client events
  room_joined: (data: JoinRoomResponse) => void;
  matchmaking_result: (data: JoinMatchmakingResponse) => void;
  room_created: (data: CreateRoomResponse) => void;
  cpu_game_created: (data: CreateCpuGameResponse) => void;
  solo_run_created: (data: CreateSoloRunResponse) => void;
  solo_run_resumed: (data: ResumeSoloRunResponse) => void;
  solo_move_result: (data: SubmitSoloMoveResponse) => void;
  solo_run_ended: (data: EndSoloRunResponse) => void;
  move_submitted: (data: SubmitMoveResponse) => void;
  player_connected: (player: Player) => void;
  player_disconnected: (playerName: string) => void;
  game_error: (error: string) => void;
  room_updated: (roomState: GameRoomState) => void;
  game_started: (state: GameRoomState) => void;
  turn_changed: (player: Player) => void;
  cpu_thinking: () => void;
  game_over: (data: { winner: Player; reason: string }) => void;
}

export interface PopularItem {
  name: string;
  count: number;
}

export interface PopularSeason {
  seasonYear: number;
  count: number;
}

export interface StatsResponse {
  windowDays: number;
  timezone: string;
  updatedAt: string;
  players: PopularItem[];
  teams: PopularItem[];
  seasons: PopularSeason[];
  longestStreak: number;
}

export * from "./testing";
