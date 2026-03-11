import fs from "fs";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { PlayerService } from "..";

jest.mock("fs", () => ({
  promises: {
    readFile: jest.fn(),
  },
}));

const mockReadFile = fs.promises.readFile as jest.MockedFunction<
  typeof fs.promises.readFile
>;

describe("@repo/types PlayerService", () => {
  const db: { query: jest.Mock<any> } = {
    query: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
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
