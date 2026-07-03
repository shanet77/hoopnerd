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

  it("returns null if top scorers list is unavailable", async () => {
    mockReadFile.mockRejectedValueOnce(new Error("missing file"));
    const service = new PlayerService(db as any);
    await expect(service.getRandomTopScorer()).resolves.toBeNull();
  });
});
