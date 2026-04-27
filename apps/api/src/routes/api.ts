import { Router, Request, Response } from "express";
import { PlayerService } from "@repo/types";
import databasePool from "@repo/database";
import { parseTimezone, parseWindowDays } from "../serverUtils";

type ApiRouterDependencies = {
  playerService: PlayerService;
};

/**
 * Creates an Express router with all HTTP API routes.
 * This extracts route definitions from server.ts (Step 3 of the refactoring).
 */
export function createApiRouter(
  dependencies: ApiRouterDependencies
): Router {
  const router = Router();
  const { playerService } = dependencies;

  // ─── Player Search ───────────────────────────────────────────────────────
  router.get("/api/players/search", async (req: Request, res: Response) => {
    const { q } = req.query;

    if (
      q === undefined ||
      q === null ||
      typeof q !== "string" ||
      q.trim() === ""
    ) {
      return res
        .status(400)
        .json({
          error: 'Query parameter "q" is required and must not be empty.',
        });
    }

    try {
      res.json(await playerService.searchPlayers(q));
    } catch (error) {
      console.error("Database query error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ─── Random Player ───────────────────────────────────────────────────────
  router.get("/api/players/random", async (req: Request, res: Response) => {
    try {
      const player = await playerService.getRandomPlayer();
      res.json(player);
    } catch (error) {
      console.error("Database query error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ─── Health Check ────────────────────────────────────────────────────────
  router.get("/health", (req: Request, res: Response) => {
    res.json({ status: "OK", timestamp: new Date().toISOString() });
  });

  // ─── Stats ───────────────────────────────────────────────────────────────
  router.get("/api/stats", async (req: Request, res: Response) => {
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
      console.error("Stats query error:", error);
      res.status(400).json({ error: "Invalid stats query" });
    }
  });

  return router;
}
