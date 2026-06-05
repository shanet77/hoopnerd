import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import supertest from "supertest";
import express from "express";
import { createApiRouter } from "../api";
import { PlayerService } from "@repo/types";
import databasePool from "@repo/database";

jest.mock("@repo/database", () => ({
  __esModule: true,
  default: {
    query: jest.fn(),
  },
}));

const mockDbQuery = databasePool.query as unknown as jest.Mock<
  (...args: any[]) => any
>;

function createTestApp(playerServiceOverrides: Partial<PlayerService> = {}) {
  const fakePlayerService = {
    searchPlayers: jest
      .fn<PlayerService["searchPlayers"]>()
      .mockResolvedValue([]),
    getRandomPlayer: jest
      .fn<PlayerService["getRandomPlayer"]>()
      .mockResolvedValue(null),
    getRandomTopScorer: jest
      .fn<PlayerService["getRandomTopScorer"]>()
      .mockResolvedValue(null),
    ...playerServiceOverrides,
  } as unknown as PlayerService;

  const app = express();
  app.use(express.json());
  app.use(createApiRouter({ playerService: fakePlayerService }));
  return { app, fakePlayerService };
}

describe("API Routes — /api/players/search", () => {
  beforeEach(() => {
    mockDbQuery.mockReset();
  });

  it("returns 400 when query param is missing", async () => {
    const { app } = createTestApp();
    await supertest(app)
      .get("/api/players/search")
      .expect(400)
      .then((res) => {
        expect(res.body.error).toContain('"q" is required');
      });
  });

  it("returns 400 when query param is empty string", async () => {
    const { app } = createTestApp();
    await supertest(app)
      .get("/api/players/search?q=")
      .expect(400)
      .then((res) => {
        expect(res.body.error).toContain('"q" is required');
      });
  });

  it("returns 400 when query param is only whitespace", async () => {
    const { app } = createTestApp();
    await supertest(app)
      .get("/api/players/search?q=%20%20")
      .expect(400)
      .then((res) => {
        expect(res.body.error).toContain('"q" is required');
      });
  });

  it("returns 500 when searchPlayers throws", async () => {
    const searchPlayers = jest
      .fn<PlayerService["searchPlayers"]>()
      .mockRejectedValue(new Error("db down"));
    const { app } = createTestApp({ searchPlayers });

    await supertest(app)
      .get("/api/players/search?q=tim")
      .expect(500)
      .then((res) => {
        expect(res.body.error).toBe("Internal server error");
      });
  });

  it("returns results from playerService.searchPlayers", async () => {
    const players = [
      { id: 1, name: "Tim Duncan", position: "PF" },
      { id: 2, name: "Tony Parker", position: "PG" },
    ];
    const searchPlayers = jest
      .fn<PlayerService["searchPlayers"]>()
      .mockResolvedValue(players);
    const { app } = createTestApp({ searchPlayers });

    await supertest(app)
      .get("/api/players/search?q=tim")
      .expect(200)
      .then((res) => {
        expect(res.body).toEqual(players);
        expect(searchPlayers).toHaveBeenCalledWith("tim");
      });
  });
});

describe("API Routes — /api/players/random", () => {
  it("returns a random player", async () => {
    const player = { id: 5, name: "Manu Ginobili", position: "SG" };
    const getRandomPlayer = jest
      .fn<PlayerService["getRandomPlayer"]>()
      .mockResolvedValue(player);
    const { app } = createTestApp({ getRandomPlayer });

    await supertest(app)
      .get("/api/players/random")
      .expect(200)
      .then((res) => {
        expect(res.body).toEqual(player);
      });
  });

  it("returns null when no players exist", async () => {
    const getRandomPlayer = jest
      .fn<PlayerService["getRandomPlayer"]>()
      .mockResolvedValue(null);
    const { app } = createTestApp({ getRandomPlayer });

    await supertest(app)
      .get("/api/players/random")
      .expect(200)
      .then((res) => {
        expect(res.body).toBeNull();
      });
  });

  it("returns 500 on database error", async () => {
    const getRandomPlayer = jest
      .fn<PlayerService["getRandomPlayer"]>()
      .mockRejectedValue(new Error("db error"));
    const { app } = createTestApp({ getRandomPlayer });

    await supertest(app)
      .get("/api/players/random")
      .expect(500)
      .then((res) => {
        expect(res.body.error).toBe("Internal server error");
      });
  });
});

describe("API Routes — /health", () => {
  it("returns 200 with status OK", async () => {
    const { app } = createTestApp();
    await supertest(app)
      .get("/health")
      .expect(200)
      .then((res) => {
        expect(res.body.status).toBe("OK");
        expect(res.body.timestamp).toBeDefined();
      });
  });
});

describe("API Routes — /api/stats", () => {
  beforeEach(() => {
    mockDbQuery.mockReset();
  });

  const defaultRows = {
    players: [{ name: "Tim Duncan", count: 3 }],
    teams: [{ name: "Spurs", count: 4 }],
    seasons: [{ seasonYear: 2005, count: 5 }],
    streak: [{ longest: 8 }],
  };

  function mockStatsResponses(overrides?: Partial<typeof defaultRows>) {
    const rows = { ...defaultRows, ...overrides };
    mockDbQuery
      .mockResolvedValueOnce({ rows: rows.players })
      .mockResolvedValueOnce({ rows: rows.teams })
      .mockResolvedValueOnce({ rows: rows.seasons })
      .mockResolvedValueOnce({ rows: rows.streak });
  }

  it("returns default windowDays and timezone when not provided", async () => {
    mockStatsResponses();
    const { app } = createTestApp();

    await supertest(app)
      .get("/api/stats")
      .expect(200)
      .then((res) => {
        expect(res.body.windowDays).toBe(7);
        expect(res.body.timezone).toBe("America/New_York");
      });
  });

  it("clamps windowDays between 1 and 365", async () => {
    mockStatsResponses();
    const { app } = createTestApp();

    await supertest(app)
      .get("/api/stats?windowDays=999")
      .expect(200)
      .then((res) => {
        expect(res.body.windowDays).toBe(365);
      });
  });

  it("uses provided timezone", async () => {
    mockStatsResponses();
    const { app } = createTestApp();

    await supertest(app)
      .get("/api/stats?tz=America%2FChicago")
      .expect(200)
      .then((res) => {
        expect(res.body.timezone).toBe("America/Chicago");
      });
  });

  it("clamps windowDays to minimum of 1", async () => {
    mockStatsResponses();
    const { app } = createTestApp();

    await supertest(app)
      .get("/api/stats?windowDays=0")
      .expect(200)
      .then((res) => {
        expect(res.body.windowDays).toBe(1);
      });
  });

  it("falls back to default timezone when tz is empty", async () => {
    mockStatsResponses();
    const { app } = createTestApp();

    await supertest(app)
      .get("/api/stats?tz=")
      .expect(200)
      .then((res) => {
        expect(res.body.timezone).toBe("America/New_York");
      });
  });

  it("returns all stats sections", async () => {
    mockStatsResponses();
    const { app } = createTestApp();

    await supertest(app)
      .get("/api/stats?windowDays=30&tz=America%2FNew_York")
      .expect(200)
      .then((res) => {
        expect(res.body.players).toEqual([{ name: "Tim Duncan", count: 3 }]);
        expect(res.body.teams).toEqual([{ name: "Spurs", count: 4 }]);
        expect(res.body.seasons).toEqual([{ seasonYear: 2005, count: 5 }]);
        expect(res.body.longestStreak).toBe(8);
      });
  });

  it("returns 400 when stats query throws", async () => {
    mockDbQuery.mockRejectedValue(new Error("query failed"));
    const { app } = createTestApp();

    await supertest(app)
      .get("/api/stats")
      .expect(500)
      .then((res) => {
        expect(res.body.error).toBe("Failed to fetch stats");
      });
  });

  it("handles missing streak row gracefully", async () => {
    mockStatsResponses({ streak: [{ longest: null }] });
    const { app } = createTestApp();

    await supertest(app)
      .get("/api/stats")
      .expect(200)
      .then((res) => {
        expect(res.body.longestStreak).toBe(0);
      });
  });
});

describe("API Routes — /api/seasons", () => {
  beforeEach(() => {
    mockDbQuery.mockReset();
  });

  it("returns distinct season years sorted descending", async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [
        { season_year: 2026 },
        { season_year: 2025 },
        { season_year: 2024 },
      ],
    });
    const { app } = createTestApp();

    await supertest(app)
      .get("/api/seasons")
      .expect(200)
      .then((res) => {
        expect(res.body).toEqual([2026, 2025, 2024]);
        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining("SELECT DISTINCT season_year"),
        );
      });
  });

  it("returns empty array when no seasons exist", async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    const { app } = createTestApp();

    await supertest(app)
      .get("/api/seasons")
      .expect(200)
      .then((res) => {
        expect(res.body).toEqual([]);
      });
  });

  it("returns 500 on database error", async () => {
    mockDbQuery.mockRejectedValueOnce(new Error("db error"));
    const { app } = createTestApp();

    await supertest(app)
      .get("/api/seasons")
      .expect(500)
      .then((res) => {
        expect(res.body.error).toBe("Failed to fetch seasons");
      });
  });
});
