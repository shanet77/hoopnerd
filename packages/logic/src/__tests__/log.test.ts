import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  getConnectionDetails,
  getPlayerById,
  validateMove,
} from "../index";

const mockDb = {
  query: jest.fn() as jest.Mock<any>,
};

describe("@repo/logic", () => {
  beforeEach(() => {
    mockDb.query.mockReset();
  });

  it("validates first move when player exists", async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ count: "1" }] });
    await expect(validateMove(mockDb as any, 10)).resolves.toBe(true);
  });

  it("fails move when one player does not exist", async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ count: "1" }] });
    await expect(validateMove(mockDb as any, 1, 2)).resolves.toBe(false);
  });

  it("validates move when players share a roster entry", async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ count: "2" }] })
      .mockResolvedValueOnce({ rows: [{ season_year: 2003, team_name: "Spurs" }] });

    await expect(validateMove(mockDb as any, 1, 2)).resolves.toBe(true);
  });

  it("returns null when no connection details exist", async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    await expect(getConnectionDetails(mockDb as any, 1, 2)).resolves.toBeNull();
  });

  it("maps connection details when result exists", async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          from_id: 1,
          from_name: "Tim Duncan",
          from_position: "PF",
          to_id: 2,
          to_name: "Tony Parker",
          to_position: "PG",
          season_year: 2005,
          team_name: "Spurs",
        },
      ],
    });

    await expect(getConnectionDetails(mockDb as any, 1, 2)).resolves.toEqual({
      fromPlayer: { id: 1, name: "Tim Duncan", position: "PF" },
      toPlayer: { id: 2, name: "Tony Parker", position: "PG" },
      seasonYear: 2005,
      teamName: "Spurs",
    });
  });

  it("gets player by id when found", async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 7, name: "David Robinson", position: "C" }],
    });
    await expect(getPlayerById(mockDb as any, 7)).resolves.toEqual({
      id: 7,
      name: "David Robinson",
      position: "C",
    });
  });

  it("returns null for missing player by id", async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    await expect(getPlayerById(mockDb as any, 999)).resolves.toBeNull();
  });

  it("bubbles query failures to caller", async () => {
    mockDb.query.mockRejectedValueOnce(new Error("DB down"));
    await expect(validateMove(mockDb as any, 1)).rejects.toThrow("DB down");
  });

  it("validates move with season range when players share that season", async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ count: "2" }] })
      .mockResolvedValueOnce({ rows: [{ season_year: 2023, team_name: "Lakers" }] });

    await expect(validateMove(mockDb as any, 1, 2, 2020, 2025)).resolves.toBe(true);
    expect(mockDb.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("r1.season_year >= $3 AND r1.season_year <= $4"),
      [1, 2, 2020, 2025],
    );
  });

  it("fails move with season range when players share team but outside range", async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ count: "2" }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(validateMove(mockDb as any, 1, 2, 2020, 2025)).resolves.toBe(false);
  });

  it("getConnectionDetails filters by season range when provided", async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          from_id: 1,
          from_name: "LeBron James",
          from_position: "SF",
          to_id: 2,
          to_name: "Anthony Davis",
          to_position: "PF",
          season_year: 2023,
          team_name: "Lakers",
        },
      ],
    });

    await expect(
      getConnectionDetails(mockDb as any, 1, 2, 2020, 2025),
    ).resolves.toEqual({
      fromPlayer: { id: 1, name: "LeBron James", position: "SF" },
      toPlayer: { id: 2, name: "Anthony Davis", position: "PF" },
      seasonYear: 2023,
      teamName: "Lakers",
    });
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("r1.season_year >= $3 AND r1.season_year <= $4"),
      [1, 2, 2020, 2025],
    );
  });
});
