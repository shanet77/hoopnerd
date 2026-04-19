import express, { type Express, Request, Response } from "express";
import cors, { type CorsOptions } from "cors";
import { Server as HttpServer } from 'http';
import { Socket } from 'socket.io';
import {
  Player,
  PlayerService,
  JoinRoomRequest,
  SubmitMoveRequest,
  JoinMatchmakingRequest,
  JoinMatchmakingResponse,
  LeaveRoomRequest
} from "@repo/types";
import databasePool from "@repo/database";
import {
  generatePlayerId,
  issueSessionToken,
  MAX_PLAYER_NAME_LENGTH,
  normalizePlayerName,
  verifySessionToken,
} from "./socketAuth";
import {
  buildAllowedOrigins,
  isOriginAllowed,
  parseTimezone,
  parseWindowDays,
} from "./serverUtils";
import { GameRoomRepository } from "./services/GameRoomRepository";

const allowedOrigins = buildAllowedOrigins(process.env.NODE_ENV, process.env.CORS_ORIGIN);

type CreateServerDependencies = {
  playerService?: PlayerService;
};

function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export const createServer = (
  dependencies: CreateServerDependencies = {}
): { app: Express; server: HttpServer } => {
  const app = express();
  const server = new HttpServer(app);
  const playerService = dependencies.playerService ?? new PlayerService(databasePool);
  
  const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
      if (isOriginAllowed(allowedOrigins, origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
    methods: ["GET", "POST", "OPTIONS"],
  };

  const io = new (require('socket.io').Server)(server, {
    cors: {
      origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
      methods: ["GET", "POST", "OPTIONS"]
    }
  });

  const roomRepository = new GameRoomRepository(io, playerService);

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
      const roomId = generateRoomId();
      roomRepository.createRoom(roomId, friendsOnly);
      socket.emit('room_created', { success: true, message: `Room ${roomId} created successfully`, roomId });
    });

    socket.on('join_matchmaking', async (data: JoinMatchmakingRequest) => {
      const normalizedName = normalizePlayerName(data.playerName ?? '');
      const friendsOnly = data.friendsOnly ?? false;
      
      if (!normalizedName || normalizedName.length > MAX_PLAYER_NAME_LENGTH) {
        socket.emit('matchmaking_result', {
          success: false,
          message: `Name is required and must be ${MAX_PLAYER_NAME_LENGTH} characters or fewer.`,
          joinedExisting: false,
        });
        return;
      }

      let selectedRoomId: string | null = null;
      let joinedExisting = false;

      if (!friendsOnly) {
        selectedRoomId = roomRepository.findAvailablePublicRoom(normalizedName);
        if (selectedRoomId) {
          joinedExisting = true;
        }
      }

      if (!selectedRoomId) {
        selectedRoomId = generateRoomId();
        roomRepository.createRoom(selectedRoomId, friendsOnly);
      }

      const room = roomRepository.getRoom(selectedRoomId)!;
      
      if (room.players.length >= 2 && !room.players.some(player => player.name.toLowerCase() === normalizedName.toLowerCase())) {
        socket.emit('matchmaking_result', {
          success: false,
          message: 'Room is full.',
          joinedExisting,
        });
        return;
      }

      if (room.players.some(player => player.name.toLowerCase() === normalizedName.toLowerCase())) {
        socket.emit('matchmaking_result', {
          success: false,
          message: 'That name is already in use for this room.',
          joinedExisting,
        });
        return;
      }

      socket.join(selectedRoomId);

      const player: Player = {
        id: generatePlayerId(room),
        name: normalizedName,
        position: 'G',
        socketId: socket.id
      };
      room.players.push(player);
      roomRepository.bindSocket(socket.id, selectedRoomId, player.id);
      const playerToken = issueSessionToken(selectedRoomId, player.id);

      io.to(selectedRoomId).emit('player_connected', player);
      io.to(selectedRoomId).emit('room_updated', room);

      const response: JoinMatchmakingResponse = {
        success: true,
        message: joinedExisting
          ? `Joined existing room ${selectedRoomId}`
          : `Created and joined room ${selectedRoomId}`,
        roomId: selectedRoomId,
        roomState: room,
        joinedExisting,
        playerToken,
        playerId: player.id,
      };

      socket.emit('matchmaking_result', response);
      await roomRepository.startGame(selectedRoomId);
    });

    socket.on('join_room', async (data: JoinRoomRequest) => {
      const { roomId, playerToken } = data;
      const normalizedName = normalizePlayerName(data.playerName ?? '');
      
      if (!normalizedName || normalizedName.length > MAX_PLAYER_NAME_LENGTH) {
        socket.emit('room_joined', {
          success: false,
          message: `Name is required and must be ${MAX_PLAYER_NAME_LENGTH} characters or fewer.`,
        });
        return;
      }

      const room = roomRepository.getOrCreateRoom(roomId);
      socket.join(roomId);

      let player: Player | undefined;
      
      if (playerToken) {
        const claims = verifySessionToken(playerToken);
        if (!claims || claims.roomId !== roomId) {
          socket.emit('room_joined', { success: false, message: 'Invalid session token.' });
          return;
        }
        player = room.players.find(existingPlayer => existingPlayer.id === claims.playerId);
        if (!player) {
          socket.emit('room_joined', { success: false, message: 'Session is no longer valid for this room.' });
          return;
        }
      } else {
        if (room.players.length >= 2) {
          socket.emit('room_joined', { success: false, message: 'Room is full.' });
          return;
        }
        if (room.players.some(existingPlayer => existingPlayer.name.toLowerCase() === normalizedName.toLowerCase())) {
          socket.emit('room_joined', { success: false, message: 'That name is already in use for this room.' });
          return;
        }

        player = { id: generatePlayerId(room), name: normalizedName, position: 'G', socketId: socket.id };
        room.players.push(player);
        io.to(roomId).emit('player_connected', player);
      }

      player.socketId = socket.id;
      roomRepository.bindSocket(socket.id, roomId, player.id);
      const newSessionToken = issueSessionToken(roomId, player.id);

      io.to(roomId).emit('room_updated', room);
      socket.emit('room_joined', {
        success: true,
        message: `Successfully joined room ${roomId}`,
        roomState: room,
        playerToken: newSessionToken,
        playerId: player.id,
      });
      
      await roomRepository.startGame(roomId);
    });

    socket.on('submit_move', async (data: SubmitMoveRequest) => {
      const { roomId, connectedPlayer, playerToken } = data;
      
      const claims = verifySessionToken(playerToken);
      if (!claims || claims.roomId !== roomId) {
        socket.emit('game_error', 'Invalid session token.');
        return;
      }

      const socketBinding = roomRepository.getSocketBinding(socket.id);
      if (
        !socketBinding
        || socketBinding.roomId !== roomId
        || socketBinding.playerId !== claims.playerId
      ) {
        socket.emit('game_error', 'Socket identity does not match session.');
        return;
      }

      const room = roomRepository.getRoom(roomId);
      if (!room || room.gameCompleted) {
        socket.emit('game_error', 'Game is not active.');
        io.to(roomId).emit('game_error', 'Game is not active.');
        return;
      }

      const requestingPlayer = room.players.find(player => player.id === claims.playerId);
      if (!requestingPlayer) {
        socket.emit('game_error', 'Player is not part of this room.');
        return;
      }

      const currentPlayerTurn = room.players[room.currentPlayerIndex];
      if (currentPlayerTurn.id !== requestingPlayer.id) {
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
        const result = await roomRepository.submitMove(roomId, claims.playerId, connectedPlayer);

        if (!result.success) {
          socket.emit('move_submitted', { success: false, message: result.message });
          io.to(roomId).emit('move_submitted', { 
            success: false, 
            message: result.message,
            errorPlayer: result.errorPlayer,
            expectedPlayer: result.expectedPlayer
          });
          io.to(roomId).emit('room_updated', room);
          return;
        }

        io.to(roomId).emit('move_submitted', {
          success: true,
          message: result.message,
          roomState: room
        });
        io.to(roomId).emit('room_updated', room);
        roomRepository.switchTurn(roomId);
      } catch (error) {
        console.error('Error validating move:', error);
        socket.emit('game_error', 'Error validating move');
        io.to(roomId).emit('game_error', 'Error validating move');
      }
    });

    socket.on('leave_room', (data: LeaveRoomRequest) => {
      const { roomId, playerToken } = data;
      
      const claims = verifySessionToken(playerToken);
      if (!claims || claims.roomId !== roomId) {
        socket.emit('game_error', 'Invalid session token.');
        return;
      }

      const socketBinding = roomRepository.getSocketBinding(socket.id);
      if (
        !socketBinding
        || socketBinding.roomId !== roomId
        || socketBinding.playerId !== claims.playerId
      ) {
        socket.emit('game_error', 'Socket identity does not match session.');
        return;
      }

      socket.leave(roomId);
      roomRepository.removeSocketBinding(socket.id);
      roomRepository.clearDisconnectGraceTimer(roomId, claims.playerId);
      roomRepository.removePlayerFromRoom(roomId, claims.playerId, 'left');
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
      roomRepository.handleDisconnect(socket.id);
    });
  });

  return { app, server };
};
