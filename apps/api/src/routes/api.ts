import { Router, Request, Response } from "express";
import type {
  PlayersRepository,
  SoloRepository,
  StatsRepository,
} from "@repo/database";
import { parseTimezone, parseWindowDays } from "../serverUtils";

type ApiRouterDependencies = {
  players: PlayersRepository;
  stats: StatsRepository;
  solo: SoloRepository;
};

/**
 * Creates an Express router with all HTTP API routes.
 */
export function createApiRouter(dependencies: ApiRouterDependencies): Router {
  const router = Router();
  const { players, stats, solo } = dependencies;

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
      res.json(await players.searchPlayers(q));
    } catch (error) {
      console.error("Database query error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.get("/api/players/random", async (req: Request, res: Response) => {
    try {
      const player = await players.getRandomPlayer();
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
      res.json(await players.getSeasons());
    } catch (error) {
      console.error("Seasons query error:", error);
      res.status(500).json({ error: "Failed to fetch seasons" });
    }
  });

  router.get("/api/stats", async (req: Request, res: Response) => {
    const windowDays = parseWindowDays(req.query.windowDays);
    const timezone = parseTimezone(req.query.tz);

    try {
      res.json(await stats.getStats(windowDays, timezone));
    } catch (error) {
      console.error("Stats query error:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  router.get("/api/solo/leaderboard", async (req: Request, res: Response) => {
    const windowDays = parseWindowDays(req.query.windowDays);
    const timezone = parseTimezone(req.query.tz);
    const limit = parseLimit(req.query.limit, 10);

    try {
      res.json(await solo.getSoloLeaderboard(windowDays, timezone, limit));
    } catch (error) {
      console.error("Solo leaderboard query error:", error);
      res.status(500).json({ error: "Failed to fetch solo leaderboard" });
    }
  });

  router.get("/api/solo/best", async (req: Request, res: Response) => {
    const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(userId)) {
      return res.status(400).json({
        error: 'Query parameter "userId" is required and must be valid.',
      });
    }

    try {
      res.json({ userId, bestStreak: await solo.getSoloBest(userId) });
    } catch (error) {
      console.error("Solo best query error:", error);
      res.status(500).json({ error: "Failed to fetch solo best" });
    }
  });

  return router;
}

const parseLimit = (value: unknown, fallback: number): number => {
  const parsed =
    typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), 50);
};
