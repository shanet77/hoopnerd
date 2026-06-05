import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { CpuEngine } from "../cpuEngine";
import type { DatabaseService, Player } from "@repo/types";

const mockDb = {
  query: jest.fn() as jest.Mock<any>,
};

describe("CpuEngine", () => {
  let engine: CpuEngine;

  const lastPlayer: Player = { id: 1, name: "LeBron James", position: "SF" };
  const usedIds = [1, 5, 10];

  const candidates: Player[] = [
    { id: 2, name: "Dwyane Wade", position: "SG" },
    { id: 3, name: "Chris Bosh", position: "PF" },
    { id: 4, name: "Kyrie Irving", position: "PG" },
  ];

  beforeEach(() => {
    mockDb.query.mockReset();
    engine = new CpuEngine({ db: mockDb as unknown as DatabaseService });
  });

  describe("getValidCandidates", () => {
    it("returns players connected to the given player, excluding used IDs", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: candidates });

      const result = await engine.getValidCandidates(1, usedIds);

      expect(result).toEqual(candidates);
      expect(mockDb.query).toHaveBeenCalledTimes(1);
      // Verify the query excludes used IDs
      const sql = mockDb.query.mock.calls[0][0];
      expect(sql).toContain("r2.player_id = p.id");
      expect(sql).toContain("p.id != ALL($2::int[])");
    });

    it("returns empty array when no valid candidates exist", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await engine.getValidCandidates(1, [1, 2, 3, 4, 5]);

      expect(result).toEqual([]);
    });
  });

  describe("getBestMove", () => {
    it("returns null when no candidates available", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await engine.getBestMove(lastPlayer, [1, 2, 3], "easy");

      expect(result).toBeNull();
    });

    describe("easy difficulty", () => {
      it("returns a random valid candidate", async () => {
        mockDb.query.mockResolvedValueOnce({ rows: candidates });

        // Mock Math.random to return a specific value
        const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.5);

        const result = await engine.getBestMove(lastPlayer, usedIds, "easy");

        expect(result).not.toBeNull();
        expect(candidates).toContainEqual(result);
        expect(mockDb.query).toHaveBeenCalledTimes(1);

        randomSpy.mockRestore();
      });

      it("never returns an already-used player", async () => {
        // usedIds already contains 5 — make sure candidate rows don't include it
        mockDb.query.mockResolvedValueOnce({ rows: candidates });

        const result = await engine.getBestMove(lastPlayer, usedIds, "easy");

        expect(result).not.toBeNull();
        expect(usedIds).not.toContain(result!.id);
      });
    });

    describe("edge cases", () => {
      it("handles single candidate correctly", async () => {
        const singleCandidate = [candidates[0]];
        mockDb.query.mockResolvedValueOnce({ rows: singleCandidate });

        const result = await engine.getBestMove(lastPlayer, usedIds, "easy");

        expect(result).toEqual(singleCandidate[0]);
      });

      it("returns null when query returns empty rows (no valid moves)", async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [] });

        const result = await engine.getBestMove(
          lastPlayer,
          [...usedIds, 2, 3, 4],
          "easy",
        );

        expect(result).toBeNull();
      });
    });

    describe("season filtering", () => {
      it("passes seasonYear to getValidCandidates query", async () => {
        mockDb.query.mockResolvedValueOnce({ rows: candidates });

        await engine.getBestMove(lastPlayer, usedIds, "easy", 2023);

        expect(mockDb.query).toHaveBeenCalledTimes(1);
        const sql = mockDb.query.mock.calls[0][0];
        expect(sql).toContain("r1.season_year = $3");
        const params = mockDb.query.mock.calls[0][1];
        expect(params).toEqual([lastPlayer.id, usedIds, 2023]);
      });

      it("getValidCandidates omits season clause when seasonYear is undefined", async () => {
        mockDb.query.mockResolvedValueOnce({ rows: candidates });

        await engine.getValidCandidates(1, usedIds);

        const sql = mockDb.query.mock.calls[0][0];
        expect(sql).not.toContain("r1.season_year = $3");
      });

      it("getValidCandidates includes season clause when seasonYear is provided", async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [] });

        await engine.getValidCandidates(1, usedIds, 2023);

        const sql = mockDb.query.mock.calls[0][0];
        expect(sql).toContain("r1.season_year = $3");
      });
    });
  });
});
