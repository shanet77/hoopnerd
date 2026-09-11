import { describe, expect, it, vi, beforeEach } from "vitest";
import supertest from "supertest";
import express from "express";
import { createApiRouter } from "../api";
import type { Repository } from "@repo/database";
import { InMemoryRepository } from "@repo/database";

function createTestApp(overrides: Partial<Repository> = {}) {
  const base = new InMemoryRepository();
  const fakeRepo: Repository = {
    searchPlayers: overrides.searchPlayers ?? vi.fn().mockResolvedValue([]),
    getRandomPlayer: overrides.getRandomPlayer ?? vi.fn().mockResolvedValue(null),
    getRandomTopScorer: overrides.getRandomTopScorer ?? vi.fn().mockResolvedValue(null),
    getPlayerById: overrides.getPlayerById ?? vi.fn().mockResolvedValue(null),
    validateMove: overrides.validateMock ?? vi.fn().mockResolvedValue(true),
    getConnectionDetails: overrides.getConnectionDetails ?? vi.fn().mockResolvedValue(null),
    getValidCandidates: overrides.getValidCandidates ?? vi.fn().mockResolvedValue([]),
    getSeasons: overrides.getSeasons ?? vi.fn().mockResolvedValue([]),
    getStats: overrides.getStats ?? vi.fn().mockResolvedValue({
      windowDays: 7,
      timezone: "America/New_York",
      updatedAt: new Date().toISOString(),
      players: [],
      teams: [],
      seasons: [],
      longestStreak: 0,
    }),
    recordGameStats: overrides.recordGameStats ?? vi.fn().mockResolvedValue(undefined),
  };

  const app = express();
  app.use(express.json());
  app.use(createApiRouter({ repository: fakeRepo }));
  return { app, fakeRepo };
}

describe("API Routes — /api/players/search", () => {
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
    const searchPlayers = vi.fn().mockRejectedValue(new Error("db down"));
    const { app } = createTestApp({ searchPlayers });

    await supertest(app)
      .get("/api/players/search?q=tim")
      .expect(500)
      .then((res) => {
        expect(res.body.error).toBe("Internal server error");
      });
  });

  it("returns results from repository.searchPlayers", async () => {
    const players = [
      { id: 1, name: "Tim Duncan", position: "PF" },
      { id: 2, name: "Tony Parker", position: "PG" },
    ];
    const searchPlayers = vi.fn().mockResolvedValue(players);
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
    const getRandomPlayer = vi.fn().mockResolvedValue(player);
    const { app } = createTestApp({ getRandomPlayer });

    await supertest(app)
      .get("/api/players/random")
      .expect(200)
      .then((res) => {
        expect(res.body).toEqual(player);
      });
  });

  it("returns null when no players exist", async () => {
    const getRandomPlayer = vi.fn().mockResolvedValue(null);
    const { app } = createTestApp({ getRandomPlayer });

    await supertest(app)
      .get("/api/players/random")
      .expect(200)
      .then((res) => {
        expect(res.body).toBeNull();
      });
  });

  it("returns 500 on database error", async () => {
    const getRandomPlayer = vi.fn().mockRejectedValue(new Error("db error"));
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
  const defaultStats = {
    windowDays: 7,
    timezone: "America/New_York",
    updatedAt: new Date().toISOString(),
    players: [{ name: "Tim Duncan", count: 3 }],
    teams: [{ name: "Spurs", count: 4 }],
    seasons: [{ seasonYear: 2005, count: 5 }],
    longestStreak: 8,
  };

  it("returns default windowDays and timezone when not provided", async () => {
    const getStats = vi.fn().mockResolvedValue({ ...defaultStats });
    const { app } = createTestApp({ getStats });

    await supertest(app)
      .get("/api/stats")
      .expect(200)
      .then((res) => {
        expect(res.body.windowDays).toBe(7);
        expect(res.body.timezone).toBe("America/New_York");
      });
  });

  it("clamps windowDays between 1 and 365", async () => {
    const getStats = vi.fn().mockImplementation(async (windowDays, tz) => ({
      ...defaultStats,
      windowDays,
      timezone: tz,
    }));
    const { app } = createTestApp({ getStats });

    await supertest(app)
      .get("/api/stats?windowDays=999")
      .expect(200)
      .then((res) => {
        expect(res.body.windowDays).toBe(365);
      });
  });

  it("uses provided timezone", async () => {
    const getStats = vi.fn().mockImplementation(async (windowDays, tz) => ({
      ...defaultStats,
      windowDays,
      timezone: tz,
    }));
    const { app } = createTestApp({ getStats });

    await supertest(app)
      .get("/api/stats?tz=America%2FChicago")
      .expect(200)
      .then((res) => {
        expect(res.body.timezone).toBe("America/Chicago");
      });
  });

  it("clamps windowDays to minimum of 1", async () => {
    const getStats = vi.fn().mockImplementation(async (windowDays, tz) => ({
      ...defaultStats,
      windowDays,
      timezone: tz,
    }));
    const { app } = createTestApp({ getStats });

    await supertest(app)
      .get("/api/stats?windowDays=0")
      .expect(200)
      .then((res) => {
        expect(res.body.windowDays).toBe(1);
      });
  });

  it("falls back to default timezone when tz is empty", async () => {
    const getStats = vi.fn().mockImplementation(async (windowDays, tz) => ({
      ...defaultStats,
      windowDays,
      timezone: tz,
    }));
    const { app } = createTestApp({ getStats });

    await supertest(app)
      .get("/api/stats?tz=")
      .expect(200)
      .then((res) => {
        expect(res.body.timezone).toBe("America/New_York");
      });
  });

  it("returns all stats sections", async () => {
    const getStats = vi.fn().mockResolvedValue({ ...defaultStats });
    const { app } = createTestApp({ getStats });

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

  it("returns 500 when stats query throws", async () => {
    const getStats = vi.fn().mockRejectedValue(new Error("query failed"));
    const { app } = createTestApp({ getStats });

    await supertest(app)
      .get("/api/stats")
      .expect(500)
      .then((res) => {
        expect(res.body.error).toBe("Failed to fetch stats");
      });
  });

  it("handles missing streak row gracefully", async () => {
    const getStats = vi.fn().mockResolvedValue({ ...defaultStats, longestStreak: 0 });
    const { app } = createTestApp({ getStats });

    await supertest(app)
      .get("/api/stats")
      .expect(200)
      .then((res) => {
        expect(res.body.longestStreak).toBe(0);
      });
  });
});

describe("API Routes — /api/seasons", () => {
  it("returns distinct season years sorted descending", async () => {
    const getSeasons = vi.fn().mockResolvedValue([2026, 2025, 2024]);
    const { app } = createTestApp({ getSeasons });

    await supertest(app)
      .get("/api/seasons")
      .expect(200)
      .then((res) => {
        expect(res.body).toEqual([2026, 2025, 2024]);
      });
  });

  it("returns empty array when no seasons exist", async () => {
    const getSeasons = vi.fn().mockResolvedValue([]);
    const { app } = createTestApp({ getSeasons });

    await supertest(app)
      .get("/api/seasons")
      .expect(200)
      .then((res) => {
        expect(res.body).toEqual([]);
      });
  });

  it("returns 500 on database error", async () => {
    const getSeasons = vi.fn().mockRejectedValue(new Error("db error"));
    const { app } = createTestApp({ getSeasons });

    await supertest(app)
      .get("/api/seasons")
      .expect(500)
      .then((res) => {
        expect(res.body.error).toBe("Failed to fetch seasons");
      });
  });
});
