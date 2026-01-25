import { Pool, QueryResult } from 'pg';

export type DatabaseService = Pool;

export interface Player {
  id: number;
  name: string;
  position: string;
  socketId?: string; // Add this line
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
}

export interface JoinRoomRequest {
  roomId: string;
  playerName: string;
}

export interface JoinRoomResponse {
  success: boolean;
  message: string;
  roomState?: GameRoomState;
}

export interface SubmitMoveRequest {
  roomId: string;
  player: Player;
  connectedPlayer: Player;
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

export interface WebSocketEvents {
  // Client to Server events
  join_room: (data: JoinRoomRequest) => void;
  create_room: () => void;
  leave_room: (roomId: string) => void;
  submit_move: (data: SubmitMoveRequest) => void;

  // Server to Client events
  room_joined: (data: JoinRoomResponse) => void;
  room_created: (data: CreateRoomResponse) => void;
  move_submitted: (data: SubmitMoveResponse) => void;
  player_connected: (player: Player) => void;
  player_disconnected: (playerName: string) => void;
  game_error: (error: string) => void;
  room_updated: (roomState: GameRoomState) => void;
  game_started: (state: GameRoomState) => void;
  turn_changed: (player: Player) => void;
  game_over: (data: { winner: Player; reason: string }) => void;
}

export class PlayerService {
  constructor(private db: DatabaseService) { }

  async searchPlayers(query: string): Promise<Player[]> {
    const searchTerm = `%${query.trim()}%`;

    const sql = `
      SELECT id, player_name AS name, position
      FROM players
      WHERE player_name ILIKE $1
      ORDER BY player_name
      LIMIT 5
    `;

    const result = await this.db.query(sql, [searchTerm]);
    return result.rows;
  }

  async getRandomPlayer(): Promise<Player | null> {
    const sql = `
      SELECT id, player_name AS name, position
      FROM players
      ORDER BY RANDOM()
      LIMIT 1
    `;

    const result = await this.db.query(sql);
    return result.rows.length > 0 ? result.rows[0] : null;
  }
}
