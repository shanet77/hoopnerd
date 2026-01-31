import { Pool, QueryResult } from 'pg';

export type DatabaseService = Pool;

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

export interface Player {
  id: number;
  name: string;
  position: string;
  socketId?: string;
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
}

export interface WebSocketEvents {
  // Client to Server events
  join_room: (data: JoinRoomRequest) => void;
  join_matchmaking: (data: JoinMatchmakingRequest) => void;
  create_room: (friendsOnly?: boolean) => void;
  leave_room: (roomId: string) => void;
  submit_move: (data: SubmitMoveRequest) => void;

  // Server to Client events
  room_joined: (data: JoinRoomResponse) => void;
  matchmaking_result: (data: JoinMatchmakingResponse) => void;
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
      WITH max_id AS (
        SELECT MAX(id) AS max_id
        FROM players
      )
      SELECT id, player_name AS name, position
      FROM players
      WHERE id >= (
        SELECT FLOOR(RANDOM() * max_id) + 1
        FROM max_id
      )
      ORDER BY id
      LIMIT 1
    `;

    const result = await this.db.query(sql);
    return result.rows.length > 0 ? result.rows[0] : null;
  }
}
