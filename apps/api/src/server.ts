import express, { type Express, Request, Response } from "express";
import cors, { type CorsOptions } from "cors";
import { Server as HttpServer } from 'http';
import { PlayerService } from "@repo/types";
import databasePool from "@repo/database";
import {
  buildAllowedOrigins,
  isOriginAllowed,
  parseTimezone,
  parseWindowDays,
} from "./serverUtils";
import { GameRoomRepository } from "./services/GameRoomRepository";
import { setupSocketIO } from "./socket";

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

  app.get('/api/stats', async (req: Request, res: Response) => {
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
      console.error('Stats query error:', error);
      res.status(400).json({ error: 'Invalid stats query' });
    }
  });

  // Setup Socket.io handlers (extracted to separate modules)
  setupSocketIO(io, roomRepository);

  return { app, server };
};
