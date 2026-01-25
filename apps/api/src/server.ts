import express, { type Express, Request, Response } from "express";
import cors from "cors";
import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import {
  Player,
  PlayerService,
  WebSocketEvents,
  JoinRoomRequest,
  SubmitMoveRequest,
  GameRoomState
} from "@repo/types";
import { validateMove } from "@repo/logic";
import databasePool from "@repo/database";

// In-memory storage for game rooms (in production, you might use Redis)
const gameRooms: Map<string, GameRoomState> = new Map();
const roomTimers: Map<string, NodeJS.Timeout> = new Map();

const playerService = new PlayerService(databasePool);

const createGameRoom = (roomId: string): GameRoomState => ({
  roomId,
  players: [],
  moves: [],
  currentPlayerIndex: 0,
  gameStarted: false,
  gameCompleted: false,
  winner: null,
});

const getPlayerByName = (room: GameRoomState, playerName: string) => {
  return room.players.find(p => p.name === playerName);
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
      room.winner = winner;
      room.gameCompleted = true;
      io.to(roomId).emit('game_over', { winner, reason: 'Opponent timed out.' });
    }
  }, 25000);

  roomTimers.set(roomId, timer);
};

const startGame = (io: SocketIOServer, roomId: string) => {
  const room = gameRooms.get(roomId);
  if (room && room.players.length >= 2 && !room.gameStarted) {
    room.gameStarted = true;
    room.currentPlayerIndex = Math.floor(Math.random() * room.players.length);
    io.to(roomId).emit('game_started', room);
    startTurnTimer(io, roomId);
  }
};

export const createServer = (): { app: Express; server: HttpServer } => {
  const app = express();
  const server = new HttpServer(app);
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.NODE_ENV === 'production' ? false : "*",
      methods: ["GET", "POST"]
    }
  });

  app.use(cors());
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

  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
  });

  io.on('connection', (socket: Socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('create_room', () => {
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      socket.join(roomId);
      gameRooms.set(roomId, createGameRoom(roomId));
      socket.emit('room_created', { success: true, message: `Room ${roomId} created successfully`, roomId });
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
        return;
      }

      const currentPlayerTurn = room.players[room.currentPlayerIndex];
      // Only allow the current player to submit a move
      if (currentPlayerTurn.socketId !== socket.id) {
          socket.emit('game_error', 'Not your turn.');
          return;
      }

      try {
        const isValidMove = await validateMove(databasePool, player.id, connectedPlayer.id);
        const response = {
          success: isValidMove,
          message: isValidMove ? 'Move accepted' : 'Move rejected - players did not play together',
        };

        if (isValidMove) {
          room.moves.push({ playerId: connectedPlayer.id, playerName: connectedPlayer.name, position: connectedPlayer.position });
          io.to(roomId).emit('move_submitted', { ...response, roomState: room });
          io.to(roomId).emit('room_updated', room);
          switchTurn(io, room);
        } else {
          socket.emit('move_submitted', response);
        }
      } catch (error) {
        console.error('Error validating move:', error);
        socket.emit('game_error', 'Error validating move');
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
            room.gameCompleted = true;
            room.winner = room.players[0] || null; // The remaining player wins
            io.to(roomId).emit('game_over', { winner: room.winner, reason: 'Opponent disconnected.' });
          }
          io.to(roomId).emit('room_updated', room);
        }
      }
    });
  });

  return { app, server };
};