import fs from "fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerService } from "..";

vi.mock("fs", () => ({
  default: {
    promises: {
      readFile: vi.fn(),
    },
  },
  promises: {
    readFile: vi.fn(),
  },
}));

const mockReadFile = fs.promises.readFile as vi.MockedFunction<
  typeof fs.promises.readFile
>;

describe("@repo/types PlayerService", () => {
  const db: { query: vi.Mock<any> } = {
    query: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("searches players with ilike wildcard", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: "Tim", position: "PF" }] });
    const service = new PlayerService(db as any);
    const results = await service.searchPlayers(" Tim ");

    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("ILIKE"), ["%Tim%"]);
    expect(results).toHaveLength(1);
  });

  it("returns random player or null", async () => {
    const service = new PlayerService(db as any);
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(service.getRandomPlayer()).resolves.toBeNull();

    db.query.mockResolvedValueOnce({ rows: [{ id: 2, name: "Manu", position: "SG" }] });
    await expect(service.getRandomPlayer()).resolves.toEqual({
      id: 2,
      name: "Manu",
      position: "SG",
    });
  });

  it("falls back to any rostered player when the scorers CSV is missing", async () => {
    mockReadFile.mockRejectedValue(new Error("missing file"));
    const service = new PlayerService(db as any);
    db.query.mockResolvedValueOnce({
      rows: [{ id: 7, name: "Fallback", position: "C" }],
    });
    await expect(service.getRandomTopScorer()).resolves.toEqual({
      id: 7,
      name: "Fallback",
      position: "C",
    });
    expect(db.query.mock.calls[0][0]).toEqual(expect.stringContaining("rosters"));
  });

  it("falls back with a season filter when top-scorer names miss the range", async () => {
    mockReadFile.mockResolvedValueOnce("Rank,Player,PTS\n1.,Washed Star,99999\n");
    const service = new PlayerService(db as any);
    // Top-scorer query matches nothing in the requested range...
    db.query.mockResolvedValueOnce({ rows: [] });
    // ...so the roster fallback runs with the season bounds.
    db.query.mockResolvedValueOnce({
      rows: [{ id: 9, name: "Range Fallback", position: "G" }],
    });
    await expect(service.getRandomTopScorer(80, 1996, 1998)).resolves.toEqual({
      id: 9,
      name: "Range Fallback",
      position: "G",
    });
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining("season_year >= $1"),
      [1996, 1998],
    );
  });

  it("returns null only when the DB itself is empty", async () => {
    mockReadFile.mockRejectedValue(new Error("missing file"));
    const service = new PlayerService(db as any);
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(service.getRandomTopScorer()).resolves.toBeNull();
  });
});
