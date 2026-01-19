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

export const createServer = (): { app: Express; server: HttpServer } => {
  const playerService = new PlayerService(databasePool);
  const app = express();

  // Create HTTP server
  const server = new HttpServer(app);

  // Initialize Socket.IO
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.NODE_ENV === 'production' ? false : "*", // Allow all origins in development
      methods: ["GET", "POST"]
    }
  });

  app.use(cors());
  app.use(express.json());

  // REST API routes
  app.get('/api/players/search', async (req: Request, res: Response) => {
    const { q } = req.query;

    if (q === undefined || q === null || typeof q !== 'string') {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    if (q.trim() === '') {
      return res.json([]);
    }

    try {
      const results = await playerService.searchPlayers(q);
      res.json(results);
    } catch (error) {
      console.error('Database query error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
  });

  // Socket.IO connection handling
  io.on('connection', (socket: Socket) => {
    console.log(`User connected: ${socket.id}`);

    // Handle joining a room
    socket.on('join_room', async (data: JoinRoomRequest) => {
      const { roomId, playerName } = data;

      // Join the room
      socket.join(roomId);

      // Create or get room state
      let roomState = gameRooms.get(roomId);
      if (!roomState) {
        roomState = {
          roomId,
          players: [],
          moves: [],
          currentPlayerIndex: 0,
          gameStarted: false,
          gameCompleted: false,
          winner: null
        };
        gameRooms.set(roomId, roomState);
      }

      // Add player to room if not already present
      const existingPlayer = roomState.players.find(p => p.name === playerName);
      if (!existingPlayer) {
        // For now, we'll add a placeholder player - in a real implementation,
        // we'd probably want to validate the player exists in the DB
        const newPlayer: Player = {
          id: Date.now(), // Temporary ID - should come from DB in real implementation
          name: playerName,
          position: 'G' // Placeholder
        };

        roomState.players.push(newPlayer);

        // Emit to all clients in the room that a player joined
        io.to(roomId).emit('player_connected', newPlayer);
      }

      // Send room state back to the joining client
      socket.emit('room_joined', {
        success: true,
        message: `Successfully joined room ${roomId}`,
        roomState
      });
    });

    // Handle creating a new room
    socket.on('create_room', () => {
      // Generate a random room ID
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();

      // Join the room
      socket.join(roomId);

      // Create room state
      const roomState: GameRoomState = {
        roomId,
        players: [],
        moves: [],
        currentPlayerIndex: 0,
        gameStarted: false,
        gameCompleted: false,
        winner: null
      };
      gameRooms.set(roomId, roomState);

      // Send room creation confirmation back to the client
      socket.emit('room_created', {
        success: true,
        message: `Room ${roomId} created successfully`,
        roomId
      });
    });

    // Handle submitting a move
    socket.on('submit_move', async (data: SubmitMoveRequest) => {
      const { roomId, player, connectedPlayer } = data;

      try {
        // Validate the move using the logic package
        const isValidMove = await validateMove(databasePool, player.id, connectedPlayer.id);

        // Get room state
        const roomState = gameRooms.get(roomId);
        if (!roomState) {
          socket.emit('game_error', 'Room not found');
          return;
        }

        // Prepare response
        const response = {
          success: isValidMove,
          message: isValidMove ? 'Move accepted' : 'Move rejected - players did not play together',
          validated: isValidMove,
          roomState
        };

        // If move is valid, add it to the room state
        if (isValidMove) {
          roomState.moves.push({
            playerId: connectedPlayer.id,
            playerName: connectedPlayer.name,
            position: connectedPlayer.position
          });

          // Broadcast the move to all players in the room
          io.to(roomId).emit('move_submitted', response);
          io.to(roomId).emit('room_updated', roomState);
        } else {
          // Send rejection to the requesting player
          socket.emit('move_submitted', response);
        }
      } catch (error) {
        console.error('Error validating move:', error);
        socket.emit('game_error', 'Error validating move');
      }
    });

    // Handle leaving a room
    socket.on('leave_room', (roomId: string) => {
      socket.leave(roomId);

      // Notify other players in the room
      socket.to(roomId).emit('player_disconnected', socket.id);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);

      // Clean up any rooms the user was in
      for (const [roomId, roomState] of gameRooms.entries()) {
        // Remove player from room if needed
        const playerIndex = roomState.players.findIndex(p => p.id.toString() === socket.id);
        if (playerIndex !== -1) {
          roomState.players.splice(playerIndex, 1);
          io.to(roomId).emit('player_disconnected', roomState.players[playerIndex]?.name || 'A player');
        }
      }
    });
  });

  return { app, server };
};
