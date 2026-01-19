import express, { type Express, Request, Response } from "express";
import cors from "cors";
import { PlayerService } from "@repo/types";
import databasePool from "@repo/database";


export const createServer = (): Express => {
  const playerService = new PlayerService(databasePool);

  const app = express();

  app.use(cors());
  app.use(express.json());

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

  return app;
};
