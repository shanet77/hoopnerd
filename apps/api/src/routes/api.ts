import { Router, Request, Response } from "express";
import type { Repository } from "@repo/database";
import { parseTimezone, parseWindowDays } from "../serverUtils";

type ApiRouterDependencies = {
  repository: Repository;
};

/**
 * Creates an Express router with all HTTP API routes.
 */
export function createApiRouter(dependencies: ApiRouterDependencies): Router {
  const router = Router();
  const { repository } = dependencies;

  router.get("/api/players/search", async (req: Request, res: Response) => {
    const { q } = req.query;

    if (
      q === undefined ||
      q === null ||
      typeof q !== "string" ||
      q.trim() === ""
    ) {
      return res.status(400).json({
        error: 'Query parameter "q" is required and must not be empty.',
      });
    }

    try {
      res.json(await repository.searchPlayers(q));
    } catch (error) {
      console.error("Database query error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.get("/api/players/random", async (req: Request, res: Response) => {
    try {
      const player = await repository.getRandomPlayer();
      res.json(player);
    } catch (error) {
      console.error("Database query error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.get("/health", (req: Request, res: Response) => {
    res.json({ status: "OK", timestamp: new Date().toISOString() });
  });

  router.get("/api/version", (_req: Request, res: Response) => {
    res.json({
      version: process.env.APP_VERSION || null,
      sha: process.env.GIT_SHA || null,
      builtAt: process.env.BUILD_TIME || null,
    });
  });

  router.get("/api/seasons", async (_req: Request, res: Response) => {
    try {
      res.json(await repository.getSeasons());
    } catch (error) {
      console.error("Seasons query error:", error);
      res.status(500).json({ error: "Failed to fetch seasons" });
    }
  });

  router.get("/api/stats", async (req: Request, res: Response) => {
    const windowDays = parseWindowDays(req.query.windowDays);
    const timezone = parseTimezone(req.query.tz);

    try {
      res.json(await repository.getStats(windowDays, timezone));
    } catch (error) {
      console.error("Stats query error:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  return router;
}
