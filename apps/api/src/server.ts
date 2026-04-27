import express, { type Express } from "express";
import cors from "cors";
import { Server as HttpServer } from "http";
import { PlayerService } from "@repo/types";
import databasePool from "@repo/database";
import { buildAllowedOrigins, buildCorsConfig } from "./serverUtils";
import { GameRoomRepository } from "./services/GameRoomRepository";
import { createSocketIOServer, setupSocketIO } from "./socket";
import { createApiRouter } from "./routes/api";

type CreateServerDependencies = {
  playerService?: PlayerService;
};

/**
 * Composition root – wires all dependencies together.
 */
export const createServer = (
  dependencies: CreateServerDependencies = {},
): { app: Express; server: HttpServer } => {
  const app = express();
  const server = new HttpServer(app);
  const playerService =
    dependencies.playerService ?? new PlayerService(databasePool);

  const allowedOrigins = buildAllowedOrigins(
    process.env.NODE_ENV,
    process.env.CORS_ORIGIN,
  );

  app.disable("x-powered-by");
  if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  app.use(cors(buildCorsConfig(allowedOrigins)));
  app.use(express.json());

  app.use(createApiRouter({ playerService }));

  const io = createSocketIOServer(server, allowedOrigins);
  const roomRepository = new GameRoomRepository(io, playerService);
  setupSocketIO(io, roomRepository);

  return { app, server };
};
