import express, { type Express, Request, Response } from "express";
import cors, { type CorsOptions } from "cors";
import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import {
  Player,
  PlayerService,
  WebSocketEvents,
  JoinRoomRequest,
  SubmitMoveRequest,
  GameRoomState,
  JoinMatchmakingRequest,
  JoinMatchmakingResponse
} from "@repo/types";
import { validateMove, getConnectionDetails, getPlayerById } from "@repo/logic";
import databasePool from "@repo/database";

// In-memory storage for game rooms (in production, you might use Redis)
const gameRooms: Map<string, GameRoomState> = new Map();
const roomTimers: Map<string, NodeJS.Timeout> = new Map();

const playerService = new PlayerService(databasePool);
const DEFAULT_STATS_WINDOW_DAYS = 7;
const DEFAULT_STATS_TIMEZONE = 'America/New_York';
const DEFAULT_ALLOWED_ORIGINS = ['https://hoopnerd.xyz', 'https://www.hoopnerd.xyz'];

const parseAllowedOrigins = (raw: string | undefined): string[] => {
  if (!raw) return [];
  return raw
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
};

const buildAllowedOrigins = () => {
  if (process.env.NODE_ENV !== 'production') {
    return ['*'];
  }

  const configured = parseAllowedOrigins(process.env.CORS_ORIGIN);
  return configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS;
};

const allowedOrigins = buildAllowedOrigins();

const isOriginAllowed = (origin: string | undefined) => {
  if (!origin) return true;
  if (allowedOrigins.includes('*')) return true;
  return allowedOrigins.includes(origin);
};

const parseWindowDays = (value: unknown): number => {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_STATS_WINDOW_DAYS;
  return Math.min(Math.max(parsed, 1), 365);
};

const parseTimezone = (value: unknown): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    return DEFAULT_STATS_TIMEZONE;
  }
  return value.trim();
};

const recordStatsForRoom = async (room: GameRoomState) => {
  if (room.statsRecorded) return;
  room.statsRecorded = true;

  const rows: Array<[string, string | null, string | null, number | null, number | null]> = [];

  for (const move of room.moves) {
    rows.push(['player', move.playerName, null, null, null]);
  }

  for (const connection of room.connections) {
    if (connection.teamName) {
      rows.push(['team', null, connection.teamName, null, null]);
    }
    if (connection.seasonYear) {
      rows.push(['season', null, null, connection.seasonYear, null]);
    }
  }

  rows.push(['streak', null, null, null, room.connections.length]);

  if (rows.length === 0) return;

  const placeholders = rows
    .map((_, index) => {
      const offset = index * 5;
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
    })
    .join(', ');

  await databasePool.query(
    `
      INSERT INTO stats_events (event_type, player_name, team_name, season_year, streak_count)
      VALUES ${placeholders}
    `,
    rows.flat()
  );
};

const endGame = (
  io: SocketIOServer,
  roomId: string,
  winner: Player | null,
  reason: string
) => {
  const room = gameRooms.get(roomId);
  if (!room || room.gameCompleted) return;

  room.gameCompleted = true;
  room.winner = winner;

  if (roomTimers.has(roomId)) {
    clearTimeout(roomTimers.get(roomId)!);
    roomTimers.delete(roomId);
  }

  io.to(roomId).emit('game_over', { winner: room.winner, reason });
  recordStatsForRoom(room).catch((error) => {
    console.error('Error recording stats:', error);
  });
};

const createGameRoom = (roomId: string, friendsOnly: boolean = false): GameRoomState => ({
  roomId,
  players: [],
  moves: [],
  currentPlayerIndex: 0,
  gameStarted: false,
  gameCompleted: false,
  winner: null,
  startingPlayer: null,
  connections: [],
  lastConnectedPlayer: null,
  friendsOnly,
  statsRecorded: false,
});

const getPlayerByName = (room: GameRoomState, playerName: string) => {
  return room.players.find(p => p.name === playerName);
};

const hasPlayerBeenUsed = (room: GameRoomState, playerId: number) => {
  if (room.startingPlayer?.id === playerId) {
    return true;
  }
  return room.moves.some(move => move.playerId === playerId);
};

const switchTurn = (io: SocketIOServer, room: GameRoomState) => {
  room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
  io.to(room.roomId).emit('turn_changed', room.players[room.currentPlayerIndex]);
  startTurnTimer(io, room.roomId);
};

const startTurnTimer = (io: SocketIOServer, roomId: string) => {
  if (roomTimers.has(roomId)) {
    clearTimeout(roomTimers.get(roomId)!);
  }

  const room = gameRooms.get(roomId);
  if (!room || room.gameCompleted) return;

  const timer = setTimeout(() => {
    if (room.players.length > 1) {
      const winner = room.players[(room.currentPlayerIndex + 1) % room.players.length];
      endGame(io, roomId, winner, 'Opponent timed out.');
    }
  }, 25000);

  roomTimers.set(roomId, timer);
};

const startGame = async (io: SocketIOServer, roomId: string) => {
  const room = gameRooms.get(roomId);
  if (room && room.players.length >= 2 && !room.gameStarted) {
    room.gameStarted = true;
    room.currentPlayerIndex = Math.floor(Math.random() * room.players.length);
    const startingPlayer = await playerService.getRandomTopScorer();
    if (!startingPlayer) {
      room.gameStarted = false;
      io.to(roomId).emit('game_error', 'No players available to start the game.');
      return;
    }
    room.startingPlayer = startingPlayer;
    room.lastConnectedPlayer = startingPlayer;
    io.to(roomId).emit('game_started', room);
    startTurnTimer(io, roomId);
  }
};

export const createServer = (): { app: Express; server: HttpServer } => {
  const app = express();
  const server = new HttpServer(app);
  const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
    methods: ["GET", "POST", "OPTIONS"],
  };
  const io = new SocketIOServer(server, {
    cors: {
      origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
      methods: ["GET", "POST", "OPTIONS"]
    }
  });

  app.disable('x-powered-by');
  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  app.use(cors(corsOptions));
  app.use(express.json());

  app.get('/api/players/search', async (req: Request, res: Response) => {
    const { q } = req.query;

    if (q === undefined || q === null || typeof q !== 'string' || q.trim() === '') {
      return res.status(400).json({ error: 'Query parameter "q" is required and must not be empty.' });
    }

    try {
      res.json(await playerService.searchPlayers(q));
    } catch (error) {
      console.error('Database query error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/players/random', async (req: Request, res: Response) => {
    try {
      const player = await playerService.getRandomPlayer();
      res.json(player);
    } catch (error) {
      console.error('Database query error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
  });

  app.get('/api/stats', async (req: Request, res: Response) => {
    const windowDays = parseWindowDays(req.query.windowDays);
    const timezone = parseTimezone(req.query.tz);

    try {
      const timeFilter = `
        created_at AT TIME ZONE $2 >= (NOW() AT TIME ZONE $2) - ($1 || ' days')::interval
      `;

      const playersResult = await databasePool.query(
        `
          SELECT player_name AS name, COUNT(*)::int AS count
          FROM stats_events
          WHERE event_type = 'player'
            AND ${timeFilter}
            AND player_name IS NOT NULL
          GROUP BY player_name
          ORDER BY count DESC, name ASC
          LIMIT 5
        `,
        [windowDays, timezone]
      );

      const teamsResult = await databasePool.query(
        `
          SELECT team_name AS name, COUNT(*)::int AS count
          FROM stats_events
          WHERE event_type = 'team'
            AND ${timeFilter}
            AND team_name IS NOT NULL
          GROUP BY team_name
          ORDER BY count DESC, name ASC
          LIMIT 5
        `,
        [windowDays, timezone]
      );

      const seasonsResult = await databasePool.query(
        `
          SELECT season_year AS "seasonYear", COUNT(*)::int AS count
          FROM stats_events
          WHERE event_type = 'season'
            AND ${timeFilter}
            AND season_year IS NOT NULL
          GROUP BY season_year
          ORDER BY count DESC, season_year DESC
          LIMIT 5
        `,
        [windowDays, timezone]
      );

      const streakResult = await databasePool.query(
        `
          SELECT COALESCE(MAX(streak_count), 0)::int AS longest
          FROM stats_events
          WHERE event_type = 'streak'
            AND ${timeFilter}
        `,
        [windowDays, timezone]
      );

      res.json({
        windowDays,
        timezone,
        updatedAt: new Date().toISOString(),
        players: playersResult.rows,
        teams: teamsResult.rows,
        seasons: seasonsResult.rows,
        longestStreak: streakResult.rows[0]?.longest ?? 0,
      });
    } catch (error) {
      console.error('Stats query error:', error);
      res.status(400).json({ error: 'Invalid stats query' });
    }
  });

  io.on('connection', (socket: Socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('create_room', (friendsOnly: boolean = false) => {
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      socket.join(roomId);
      gameRooms.set(roomId, createGameRoom(roomId, friendsOnly));
      socket.emit('room_created', { success: true, message: `Room ${roomId} created successfully`, roomId });
    });

    socket.on('join_matchmaking', (data: JoinMatchmakingRequest) => {
      const { playerName, friendsOnly = false } = data;

      let selectedRoomId: string | null = null;
      let joinedExisting = false;

      if (!friendsOnly) {
        for (const [roomId, room] of gameRooms.entries()) {
          if (!room.friendsOnly && room.players.length < 2 && !room.gameStarted) {
            selectedRoomId = roomId;
            joinedExisting = true;
            break;
          }
        }
      }

      if (!selectedRoomId) {
        selectedRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        gameRooms.set(selectedRoomId, createGameRoom(selectedRoomId, friendsOnly));
      }

      const room = gameRooms.get(selectedRoomId)!;
      socket.join(selectedRoomId);

      const player: Player = { id: Date.now(), name: playerName, position: 'G', socketId: socket.id };
      room.players.push(player);
      io.to(selectedRoomId).emit('player_connected', player);
      io.to(selectedRoomId).emit('room_updated', room);

      const response: JoinMatchmakingResponse = {
        success: true,
        message: joinedExisting
          ? `Joined existing room ${selectedRoomId}`
          : `Created and joined room ${selectedRoomId}`,
        roomId: selectedRoomId,
        roomState: room,
        joinedExisting
      };

      socket.emit('matchmaking_result', response);
    });

    socket.on('join_room', async (data: JoinRoomRequest) => {
      const { roomId, playerName } = data;
      let room = gameRooms.get(roomId);
      if (!room) {
        room = createGameRoom(roomId);
        gameRooms.set(roomId, room);
      }

      socket.join(roomId);

      let player = room.players.find(p => p.name === playerName);
      if (player) {
        // Player already exists, update their socket ID
        player.socketId = socket.id;
      } else {
        // Add new player
        player = { id: Date.now(), name: playerName, position: 'G', socketId: socket.id };
        room.players.push(player);
        io.to(roomId).emit('player_connected', player);
      }
      io.to(roomId).emit('room_updated', room);


      socket.emit('room_joined', { success: true, message: `Successfully joined room ${roomId}`, roomState: room });
      startGame(io, roomId);
    });

    socket.on('submit_move', async (data: SubmitMoveRequest) => {
      const { roomId, player, connectedPlayer } = data;
      const room = gameRooms.get(roomId);

      if (!room || room.gameCompleted) {
        socket.emit('game_error', 'Game is not active.');
        io.to(roomId).emit('game_error', 'Game is not active.');
        return;
      }

      const currentPlayerTurn = room.players[room.currentPlayerIndex];
      if (currentPlayerTurn.socketId !== socket.id) {
        socket.emit('game_error', 'Not your turn.');
        io.to(roomId).emit('game_error', `${currentPlayerTurn.name}'s turn.`);
        return;
      }

      if (!room.startingPlayer) {
        socket.emit('game_error', 'Game not properly initialized.');
        io.to(roomId).emit('game_error', 'Game not properly initialized.');
        return;
      }

      try {
        if (hasPlayerBeenUsed(room, connectedPlayer.id)) {
          const errorMsg = `Invalid move! ${connectedPlayer.name} was already used in this game.`;
          socket.emit('move_submitted', { success: false, message: errorMsg });
          io.to(roomId).emit('move_submitted', { success: false, message: errorMsg });
          io.to(roomId).emit('room_updated', room);
          return;
        }

        if (room.lastConnectedPlayer) {
          const isValidMove = await validateMove(databasePool, room.lastConnectedPlayer.id, connectedPlayer.id);

          if (!isValidMove) {
            const errorMsg = `Invalid connection! ${connectedPlayer.name} did not play with ${room.lastConnectedPlayer.name}`;
            socket.emit('move_submitted', { success: false, message: errorMsg });
            io.to(roomId).emit('move_submitted', {
              success: false,
              message: errorMsg,
              errorPlayer: connectedPlayer.name,
              expectedPlayer: room.lastConnectedPlayer.name
            });
            io.to(roomId).emit('room_updated', room);
            return;
          }

          const connection = await getConnectionDetails(databasePool, room.lastConnectedPlayer.id, connectedPlayer.id);
          if (connection) {
            room.connections.push(connection);
          }
        }

        room.moves.push({ playerId: connectedPlayer.id, playerName: connectedPlayer.name, position: connectedPlayer.position });
        room.lastConnectedPlayer = connectedPlayer;

        io.to(roomId).emit('move_submitted', {
          success: true,
          message: `${connectedPlayer.name} connected to ${room.lastConnectedPlayer ? 'chain' : 'start'}!`,
          roomState: room
        });
        io.to(roomId).emit('room_updated', room);
        switchTurn(io, room);
      } catch (error) {
        console.error('Error validating move:', error);
        socket.emit('game_error', 'Error validating move');
        io.to(roomId).emit('game_error', 'Error validating move');
      }
    });

    socket.on('leave_room', (roomId: string) => {
      socket.leave(roomId);
      const room = gameRooms.get(roomId);
      if (room) {
        const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex !== -1) {
          const playerName = room.players[playerIndex].name;
          room.players.splice(playerIndex, 1);
          io.to(roomId).emit('player_disconnected', playerName);
          if (room.gameStarted && !room.gameCompleted && room.players.length < 2) {
            const winner = room.players[0] || null;
            endGame(io, roomId, winner, 'Opponent left the room.');
          }
          io.to(roomId).emit('room_updated', room);
        }
      }
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
      for (const [roomId, room] of gameRooms.entries()) {
        const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex !== -1) {
          const disconnectedPlayer = room.players[playerIndex];
          room.players.splice(playerIndex, 1);
          io.to(roomId).emit('player_disconnected', disconnectedPlayer.name);
          if (room.gameStarted && !room.gameCompleted && room.players.length < 2) {
            const winner = room.players[0] || null;
            endGame(io, roomId, winner, 'Opponent disconnected.');
          }
          io.to(roomId).emit('room_updated', room);
        }
      }
    });
  });

  return { app, server };
};
