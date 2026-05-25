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

    describe("medium difficulty", () => {
      it("prefers players with fewer connections", async () => {
        // First query: get valid candidates
        mockDb.query.mockResolvedValueOnce({ rows: candidates });

        // Second query: connection counts per candidate
        mockDb.query.mockResolvedValueOnce({
          rows: [
            { id: 3, connection_count: "5" }, // Chris Bosh: fewest
            { id: 2, connection_count: "10" }, // Dwyane Wade
            { id: 4, connection_count: "15" }, // Kyrie Irving: most
          ],
        });

        const result = await engine.getBestMove(lastPlayer, usedIds, "medium");

        expect(result).not.toBeNull();
        expect(result!.id).toBe(3); // Should pick Chris Bosh (fewest connections)
        expect(mockDb.query).toHaveBeenCalledTimes(2);
      });

      it("never returns an already-used player", async () => {
        mockDb.query.mockResolvedValueOnce({ rows: candidates });
        mockDb.query.mockResolvedValueOnce({
          rows: [
            { id: 2, connection_count: "3" },
            { id: 4, connection_count: "7" },
          ],
        });

        const result = await engine.getBestMove(lastPlayer, usedIds, "medium");

        expect(result).not.toBeNull();
        expect(usedIds).not.toContain(result!.id);
      });
    });

    describe("hard difficulty", () => {
      it("picks the candidate that minimizes opponent's options", async () => {
        // First query: get valid candidates
        mockDb.query.mockResolvedValueOnce({ rows: candidates });

        // Second query: opponent options per candidate (excluding used IDs)
        mockDb.query.mockResolvedValueOnce({
          rows: [
            { candidate_id: 2, opponent_options: "3" }, // Dwyane Wade: fewest options for opponent
            { candidate_id: 4, opponent_options: "8" }, // Kyrie Irving
            { candidate_id: 3, opponent_options: "12" }, // Chris Bosh: most options
          ],
        });

        const result = await engine.getBestMove(lastPlayer, usedIds, "hard");

        expect(result).not.toBeNull();
        expect(result!.id).toBe(2); // Should pick Dwyane Wade (fewest opponent options)
        expect(mockDb.query).toHaveBeenCalledTimes(2);
      });

      it("excludes used player IDs from opponent option counts", async () => {
        mockDb.query.mockResolvedValueOnce({ rows: candidates });
        mockDb.query.mockResolvedValueOnce({
          rows: [
            { candidate_id: 3, opponent_options: "0" },
            { candidate_id: 2, opponent_options: "1" },
          ],
        });

        const result = await engine.getBestMove(lastPlayer, usedIds, "hard");

        expect(result).not.toBeNull();
        // The hard query should have usedPlayerIds as the second parameter
        const hardQueryCall = mockDb.query.mock.calls[1];
        expect(hardQueryCall[1]).toEqual([
          candidates.map((c) => c.id),
          usedIds,
        ]);
      });

      it("never returns an already-used player", async () => {
        mockDb.query.mockResolvedValueOnce({ rows: candidates });
        mockDb.query.mockResolvedValueOnce({
          rows: [
            { candidate_id: 2, opponent_options: "5" },
            { candidate_id: 4, opponent_options: "8" },
          ],
        });

        const result = await engine.getBestMove(lastPlayer, usedIds, "hard");

        expect(result).not.toBeNull();
        expect(usedIds).not.toContain(result!.id);
      });
    });

    describe("edge cases", () => {
      it("defaults to random when unknown difficulty is provided", async () => {
        mockDb.query.mockResolvedValueOnce({ rows: candidates });

        const result = await engine.getBestMove(
          lastPlayer,
          usedIds,
          "invalid" as any,
        );

        expect(result).not.toBeNull();
        expect(candidates).toContainEqual(result);
      });

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
          "hard",
        );

        expect(result).toBeNull();
      });
    });
  });
});
