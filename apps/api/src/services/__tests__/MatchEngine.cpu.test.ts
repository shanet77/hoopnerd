import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createMockRepo,
  createTestEngine,
  RecordingSink,
  type Mockify,
} from "./harness";

describe("MatchEngine CPU turns", () => {
  let sink: RecordingSink;
  let mockRepo: Mockify<any>;

  beforeEach(() => {
    vi.useFakeTimers();
    sink = new RecordingSink();

    mockRepo = createMockRepo();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("CPU turns", () => {
    const cpuEngine = {
      getBestMove: vi.fn(),
    };

    const setupCpuGame = async () => {
      mockRepo.getRandomTopScorer.mockResolvedValue({
        id: 500,
        name: "Starter",
        position: "C",
      });
      const cpuMatchEngine = createTestEngine({
        repo: mockRepo,
        sink,
        cpuEngine,
      });
      // Math.random drives both starting index (>= .5 → CPU) and delay.
      vi.spyOn(Math, "random").mockReturnValue(0.9);
      const created = cpuMatchEngine.createCpuGame(
        "CPUROOM",
        "Human",
        "easy",
        "sock-1",
      );
      await cpuMatchEngine.start("CPUROOM");
      return { cpuMatchEngine, created };
    };

    it("drives a CPU turn and returns control to the human", async () => {
      cpuEngine.getBestMove.mockResolvedValue({
        id: 777,
        name: "BotPick",
        position: "C",
      });
      const { created } = await setupCpuGame();
      const { room } = created;

      expect(room.currentPlayerIndex).toBe(1);

      await vi.advanceTimersByTimeAsync(2500);

      expect(cpuEngine.getBestMove).toHaveBeenCalledTimes(1);
      expect(sink.of("cpu_thinking")).toHaveLength(1);
      expect(room.moves).toHaveLength(1);
      expect(room.moves[0].playerId).toBe(777);
      expect(room.currentPlayerIndex).toBe(0);
    });

    it("forfeits to the human when the CPU has no valid moves", async () => {
      cpuEngine.getBestMove.mockResolvedValue(null);
      const { created } = await setupCpuGame();
      const { room } = created;

      await vi.advanceTimersByTimeAsync(2500);

      expect(room.gameCompleted).toBe(true);
      expect(room.winner?.id).toBe(room.players[0].id);
      expect(sink.last("game_over")?.payload.reason).toContain(
        "no valid moves",
      );
    });
  });
});
