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
});
