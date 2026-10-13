import express, { type Express } from "express";
import cors from "cors";
import { Server as HttpServer } from "http";
import databasePool, { PgRepository } from "@repo/database";
import type { Repository } from "@repo/database";
import { CpuEngine } from "./services/CpuEngine";
import { buildAllowedOrigins, buildCorsConfig } from "./serverUtils";
import { MatchEngine } from "./services/MatchEngine";
import { SoloEngine } from "./services/SoloEngine";
import { SocketMatchEventSink } from "./socket/MatchSocketAdapter";
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

  // CPU mode (enabled by default, disable with ENABLE_CPU_MODE=false)
  const enableCpuMode = process.env.ENABLE_CPU_MODE !== "false";
  const matchEngine = new MatchEngine({
    repository,
    sink: new SocketMatchEventSink(io),
    cpuEngine: enableCpuMode ? new CpuEngine({ repository }) : undefined,
  });

  const soloEngine = new SoloEngine({ repository });

  setupSocketIO(io, matchEngine, enableCpuMode, soloEngine);

  return { app, server };
};
