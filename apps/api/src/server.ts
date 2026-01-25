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

const startGame = async (io: SocketIOServer, roomId: string) => {
  const room = gameRooms.get(roomId);
  if (room && room.players.length >= 2 && !room.gameStarted) {
    room.gameStarted = true;
    room.currentPlayerIndex = Math.floor(Math.random() * room.players.length);
    room.startingPlayer = await playerService.getRandomPlayer();
    room.lastConnectedPlayer = room.startingPlayer;
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