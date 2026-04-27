import express, { type Express } from "express";
import cors, { type CorsOptions } from "cors";
import { Server as HttpServer } from 'http';
import { PlayerService } from "@repo/types";
import databasePool from "@repo/database";
import {
  buildAllowedOrigins,
  isOriginAllowed,
} from "./serverUtils";
import { GameRoomRepository } from "./services/GameRoomRepository";
import { setupSocketIO } from "./socket";
import { createApiRouter } from "./routes/api";

const allowedOrigins = buildAllowedOrigins(process.env.NODE_ENV, process.env.CORS_ORIGIN);

type CreateServerDependencies = {
  playerService?: PlayerService;
};

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

  // Mount HTTP API routes (extracted to routes/api.ts)
  app.use(createApiRouter({ playerService }));

  // Setup Socket.io handlers (extracted to separate modules)
  setupSocketIO(io, roomRepository);

  return { app, server };
};
