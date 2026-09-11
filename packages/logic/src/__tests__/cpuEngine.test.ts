import { beforeEach, describe, expect, it, vi } from "vitest";
import { CpuEngine } from "../cpuEngine";
import type { Player } from "@repo/types";

const mockRepo = {
  getValidCandidates: vi.fn(),
} as any;

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
    vi.clearAllMocks();
    engine = new CpuEngine({ repository: mockRepo });
  });

  describe("getValidCandidates", () => {
    it("returns players connected to the given player, excluding used IDs", async () => {
      mockRepo.getValidCandidates.mockResolvedValue(candidates);

      const result = await engine.getValidCandidates(1, usedIds);

      expect(result).toEqual(candidates);
      expect(mockRepo.getValidCandidates).toHaveBeenCalledWith(1, usedIds, undefined, undefined);
    });

    it("returns empty array when no valid candidates exist", async () => {
      mockRepo.getValidCandidates.mockResolvedValue([]);

      const result = await engine.getValidCandidates(1, [1, 2, 3, 4, 5]);

      expect(result).toEqual([]);
    });
  });

  describe("getBestMove", () => {
    it("returns null when no candidates available", async () => {
      mockRepo.getValidCandidates.mockResolvedValue([]);

      const result = await engine.getBestMove(lastPlayer, [1, 2, 3], "easy");

      expect(result).toBeNull();
    });

    describe("easy difficulty", () => {
      it("returns a random valid candidate", async () => {
        mockRepo.getValidCandidates.mockResolvedValue(candidates);

        const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);

        const result = await engine.getBestMove(lastPlayer, usedIds, "easy");

        expect(result).not.toBeNull();
        expect(candidates).toContainEqual(result);
        expect(mockRepo.getValidCandidates).toHaveBeenCalledTimes(1);

        randomSpy.mockRestore();
      });

      it("never returns an already-used player", async () => {
        mockRepo.getValidCandidates.mockResolvedValue(candidates);

        const result = await engine.getBestMove(lastPlayer, usedIds, "easy");

        expect(result).not.toBeNull();
        expect(usedIds).not.toContain(result!.id);
      });
    });

    describe("edge cases", () => {
      it("handles single candidate correctly", async () => {
        const singleCandidate = [candidates[0]];
        mockRepo.getValidCandidates.mockResolvedValue(singleCandidate);

        const result = await engine.getBestMove(lastPlayer, usedIds, "easy");

        expect(result).toEqual(singleCandidate[0]);
      });

      it("returns null when query returns empty rows (no valid moves)", async () => {
        mockRepo.getValidCandidates.mockResolvedValue([]);

        const result = await engine.getBestMove(
          lastPlayer,
          [...usedIds, 2, 3, 4],
          "easy",
        );

        expect(result).toBeNull();
      });
    });

    describe("season filtering", () => {
      it("passes seasonYearMin/seasonYearMax to getValidCandidates", async () => {
        mockRepo.getValidCandidates.mockResolvedValue(candidates);

        await engine.getBestMove(lastPlayer, usedIds, "easy", 2020, 2023);

        expect(mockRepo.getValidCandidates).toHaveBeenCalledWith(
          lastPlayer.id, usedIds, 2020, 2023
        );
      });

      it("getValidCandidates omits season args when both are undefined", async () => {
        mockRepo.getValidCandidates.mockResolvedValue(candidates);

        await engine.getValidCandidates(1, usedIds);

        expect(mockRepo.getValidCandidates).toHaveBeenCalledWith(1, usedIds, undefined, undefined);
      });

      it("getValidCandidates includes season args when both provided", async () => {
        mockRepo.getValidCandidates.mockResolvedValue([]);

        await engine.getValidCandidates(1, usedIds, 2010, 2020);

        expect(mockRepo.getValidCandidates).toHaveBeenCalledWith(1, usedIds, 2010, 2020);
      });
    });
  });
});
