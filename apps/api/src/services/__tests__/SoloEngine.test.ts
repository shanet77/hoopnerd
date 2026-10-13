import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { SoloEngine } from "../SoloEngine";
import type { Player } from "@repo/types";

type Mockify<T> = { [K in keyof T]: ReturnType<typeof vi.fn> };

const starter: Player = { id: 1, name: "Tim Duncan", position: "PF" };
const teammate: Player = { id: 2, name: "Tony Parker", position: "PG" };
const teammate2: Player = { id: 3, name: "Manu Ginobili", position: "SG" };
const outsider: Player = { id: 99, name: "Michael Jordan", position: "SG" };

describe("SoloEngine", () => {
  let engine: SoloEngine;
  let mockRepo: Mockify<any>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockRepo = {
      getRandomTopScorer: vi.fn().mockResolvedValue(starter),
      validateMove: vi.fn().mockResolvedValue(true),
      getConnectionDetails: vi.fn().mockResolvedValue(null),
      hasAnyValidMove: vi.fn().mockResolvedValue(true),
      recordSoloRun: vi
        .fn()
        .mockResolvedValue({ bestStreak: 0, isNewBest: true }),
    };
    engine = new SoloEngine({
      repository: mockRepo as any,
      idleTtlMs: 2 * 60 * 60 * 1000,
      sweepIntervalMs: 1000,
    });
  });

  afterEach(() => {
    engine.stop();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const createRun = () =>
    engine.create("user-1", "Shane", undefined, undefined);

  describe("create", () => {
    it("creates a run seeded with a starting player", async () => {
      const run = await createRun();

      expect(run).not.toBeNull();
      expect(run?.userId).toBe("user-1");
      expect(run?.displayName).toBe("Shane");
      expect(run?.gameStarted).toBe(true);
      expect(run?.gameCompleted).toBe(false);
      expect(run?.startingPlayer).toEqual(starter);
      expect(run?.lastConnectedPlayer).toEqual(starter);
      expect(run?.moves).toEqual([]);
    });

    it("retries when the starting player has no valid moves", async () => {
      mockRepo.getRandomTopScorer
        .mockResolvedValueOnce(outsider)
        .mockResolvedValueOnce(starter);
      mockRepo.hasAnyValidMove
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const run = await createRun();

      expect(run?.startingPlayer).toEqual(starter);
      expect(mockRepo.getRandomTopScorer).toHaveBeenCalledTimes(2);
    });

    it("returns null when no players are available", async () => {
      mockRepo.getRandomTopScorer.mockResolvedValue(null);

      await expect(createRun()).resolves.toBeNull();
    });
  });

  describe("submitMove", () => {
    it("accepts a valid connection and grows the streak", async () => {
      const run = (await createRun())!;
      mockRepo.getConnectionDetails.mockResolvedValue({
        fromPlayer: starter,
        toPlayer: teammate,
        seasonYear: 2005,
        teamName: "San Antonio Spurs",
      });

      const outcome = await engine.submitMove(run.roomId, "user-1", teammate);

      expect(outcome.success).toBe(true);
      expect(outcome.streak).toBe(1);
      expect(outcome.ended).toBeUndefined();
      expect(mockRepo.validateMove).toHaveBeenCalledWith(
        starter.id,
        teammate.id,
        undefined,
        undefined,
      );
      expect(run.moves).toHaveLength(1);
      expect(run.connections).toHaveLength(1);
      expect(run.lastConnectedPlayer).toEqual(teammate);
    });

    it("checks for remaining moves excluding all used players", async () => {
      const run = (await createRun())!;
      await engine.submitMove(run.roomId, "user-1", teammate);

      expect(mockRepo.hasAnyValidMove).toHaveBeenCalledWith(
        teammate.id,
        expect.arrayContaining([starter.id, teammate.id]),
        undefined,
        undefined,
      );
    });

    it("ends the run with reason repeat on a used player", async () => {
      const run = (await createRun())!;
      await engine.submitMove(run.roomId, "user-1", teammate);

      const outcome = await engine.submitMove(run.roomId, "user-1", starter);

      expect(outcome.success).toBe(false);
      expect(outcome.ended).toBe(true);
      expect(outcome.endReason).toBe("repeat");
      expect(outcome.streak).toBe(1);
      expect(run.gameCompleted).toBe(true);
      expect(mockRepo.recordSoloRun).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          displayName: "Shane",
          streakCount: 1,
          endReason: "repeat",
        }),
      );
    });

    it("ends the run with reason invalid on a wrong connection", async () => {
      const run = (await createRun())!;
      mockRepo.validateMove.mockResolvedValue(false);

      const outcome = await engine.submitMove(run.roomId, "user-1", outsider);

      expect(outcome.success).toBe(false);
      expect(outcome.ended).toBe(true);
      expect(outcome.endReason).toBe("invalid");
      expect(run.moves).toHaveLength(0);
      expect(mockRepo.recordSoloRun).toHaveBeenCalledWith(
        expect.objectContaining({ streakCount: 0, endReason: "invalid" }),
      );
    });

    it("ends the run with reason stuck when no moves remain", async () => {
      const run = (await createRun())!;
      mockRepo.hasAnyValidMove.mockResolvedValue(false);

      const outcome = await engine.submitMove(run.roomId, "user-1", teammate);

      expect(outcome.success).toBe(true);
      expect(outcome.ended).toBe(true);
      expect(outcome.endReason).toBe("stuck");
      expect(outcome.streak).toBe(1);
      expect(run.moves).toHaveLength(1);
    });

    it("rejects submissions for an unknown run", async () => {
      const outcome = await engine.submitMove("NOPE12", "user-1", teammate);

      expect(outcome.success).toBe(false);
      expect(outcome.message).toMatch(/not found/i);
    });

    it("rejects submissions from another user", async () => {
      const run = (await createRun())!;

      const outcome = await engine.submitMove(run.roomId, "user-2", teammate);

      expect(outcome.success).toBe(false);
      expect(outcome.message).toMatch(/another player/i);
    });

    it("rejects submissions after the run ended", async () => {
      const run = (await createRun())!;
      await engine.endRun(run.roomId, "user-1");

      const outcome = await engine.submitMove(run.roomId, "user-1", teammate);

      expect(outcome.success).toBe(false);
      expect(outcome.message).toMatch(/already ended/i);
    });

    it("rejects concurrent submissions while one is in flight", async () => {
      const run = (await createRun())!;
      let releaseValidation: (() => void) | undefined;
      mockRepo.validateMove.mockReturnValue(
        new Promise<boolean>((resolve) => {
          releaseValidation = () => resolve(true);
        }),
      );

      const first = engine.submitMove(run.roomId, "user-1", teammate);
      const second = await engine.submitMove(run.roomId, "user-1", teammate2);

      expect(second.success).toBe(false);
      expect(second.message).toMatch(/previous move/i);

      releaseValidation?.();
      const firstOutcome = await first;
      expect(firstOutcome.success).toBe(true);
    });
  });

  describe("endRun", () => {
    it("forfeits and banks the current streak", async () => {
      const run = (await createRun())!;
      await engine.submitMove(run.roomId, "user-1", teammate);
      mockRepo.recordSoloRun.mockClear();

      const outcome = await engine.endRun(run.roomId, "user-1");

      expect(outcome.success).toBe(true);
      expect(outcome.streak).toBe(1);
      expect(outcome.endReason).toBe("forfeit");
      expect(run.gameCompleted).toBe(true);
      expect(mockRepo.recordSoloRun).toHaveBeenCalledWith(
        expect.objectContaining({ streakCount: 1, endReason: "forfeit" }),
      );
    });

    it("reports the new personal best", async () => {
      const run = (await createRun())!;
      mockRepo.recordSoloRun.mockResolvedValue({
        bestStreak: 7,
        isNewBest: true,
      });

      const outcome = await engine.endRun(run.roomId, "user-1");

      expect(outcome.personalBest).toBe(7);
      expect(outcome.isNewBest).toBe(true);
    });

    it("records a run only once", async () => {
      const run = (await createRun())!;
      await engine.endRun(run.roomId, "user-1");
      await engine.endRun(run.roomId, "user-1");

      expect(mockRepo.recordSoloRun).toHaveBeenCalledTimes(1);
    });

    it("still ends the run when recording fails", async () => {
      const run = (await createRun())!;
      mockRepo.recordSoloRun.mockRejectedValue(new Error("db down"));

      const outcome = await engine.endRun(run.roomId, "user-1");

      expect(outcome.success).toBe(true);
      expect(outcome.streak).toBe(0);
      expect(outcome.personalBest).toBe(0);
      expect(run.gameCompleted).toBe(true);
    });
  });

  describe("resume + eviction", () => {
    it("resumes an active run", async () => {
      const run = (await createRun())!;

      const resumed = engine.resumeRun(run.roomId);

      expect(resumed?.roomId).toBe(run.roomId);
    });

    it("evicts idle runs without recording them", async () => {
      const run = (await createRun())!;

      vi.advanceTimersByTime(3 * 60 * 60 * 1000);

      expect(engine.resumeRun(run.roomId)).toBeUndefined();
      expect(mockRepo.recordSoloRun).not.toHaveBeenCalled();
    });

    it("keeps runs that stay active", async () => {
      const run = (await createRun())!;

      vi.advanceTimersByTime(60 * 60 * 1000);
      await engine.submitMove(run.roomId, "user-1", teammate);
      vi.advanceTimersByTime(60 * 60 * 1000);

      expect(engine.resumeRun(run.roomId)).toBeDefined();
    });
  });
});
