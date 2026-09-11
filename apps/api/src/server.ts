import express, { type Express } from "express";
import cors from "cors";
import { Server as HttpServer } from "http";
import databasePool, { PgRepository } from "@repo/database";
import type { Repository } from "@repo/database";
import { CpuEngine } from "@repo/logic";
import { buildAllowedOrigins, buildCorsConfig } from "./serverUtils";
import { GameRoomRepository } from "./services/GameRoomRepository";
import { CpuGameService } from "./services/CpuGameService";
import { createSocketIOServer, setupSocketIO } from "./socket";
import { createApiRouter } from "./routes/api";

type CreateServerDependencies = {
  repository?: Repository;
};

/**
 * Composition root – wires all dependencies together.
 */
export const createServer = (
  dependencies: CreateServerDependencies = {},
): { app: Express; server: HttpServer } => {
  const app = express();
  const server = new HttpServer(app);
  const repository = dependencies.repository ?? new PgRepository(databasePool);

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

  app.use(createApiRouter({ repository }));

  const io = createSocketIOServer(server, allowedOrigins);
  const roomRepository = new GameRoomRepository(io, repository);

  // CPU mode setup (enabled by default, disable with ENABLE_CPU_MODE=false)
  const enableCpuMode = process.env.ENABLE_CPU_MODE !== "false";
  let cpuGameService: CpuGameService | undefined;
  if (enableCpuMode) {
    const cpuEngine = new CpuEngine({ repository });
    cpuGameService = new CpuGameService(roomRepository, cpuEngine);
  }

  setupSocketIO(io, roomRepository, cpuGameService);

  return { app, server };
};
