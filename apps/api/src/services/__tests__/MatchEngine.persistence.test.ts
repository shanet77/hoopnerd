import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MatchEngine } from "../MatchEngine";
import {
  createMockRepo,
  createTestEngine,
  makeStartedRoom,
  RecordingSink,
  type Mockify,
} from "./harness";

describe("MatchEngine persistence", () => {
  let engine: MatchEngine;
  let sink: RecordingSink;
  let mockRepo: Mockify<any>;

  beforeEach(() => {
    vi.useFakeTimers();
    sink = new RecordingSink();

    mockRepo = createMockRepo();

    engine = createTestEngine({ repo: mockRepo, sink });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("persistence", () => {
    it("saves a room snapshot on create", async () => {
      engine.createRoom("SAVE1");

      await engine.saveRoom("SAVE1");

      expect(mockRepo.saveGameState).toHaveBeenCalledWith(
        "match",
        "SAVE1",
        expect.objectContaining({
          version: 1,
          room: expect.objectContaining({ roomId: "SAVE1" }),
        }),
      );
    });

    it("restores a started room and restarts its turn timer", async () => {
      mockRepo.loadGameStates.mockResolvedValue([
        {
          id: "RESTORE1",
          state: { version: 1, room: makeStartedRoom("RESTORE1") },
          updatedAt: new Date(),
        },
      ]);

      await engine.restore();

      const restored = engine.getRoom("RESTORE1");
      expect(restored).toBeDefined();
      expect(restored?.players.map((player) => player.socketId)).toEqual([
        undefined,
        undefined,
      ]);

      vi.advanceTimersByTime(25000);

      expect(restored?.gameCompleted).toBe(true);
      expect(sink.last("game_over")).toBeDefined();
    });

    it("drops completed rooms and stale lobbies on restore", async () => {
      const completed = makeStartedRoom("DONE1");
      completed.gameCompleted = true;
      const staleLobby = makeStartedRoom("LOBBY1");
      staleLobby.gameStarted = false;
      staleLobby.players = [];
      staleLobby.startingPlayer = null;
      staleLobby.lastConnectedPlayer = null;

      mockRepo.loadGameStates.mockResolvedValue([
        {
          id: "DONE1",
          state: { version: 1, room: completed },
          updatedAt: new Date(),
        },
        {
          id: "LOBBY1",
          state: { version: 1, room: staleLobby },
          updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        },
      ]);

      await engine.restore();

      expect(engine.getRoom("DONE1")).toBeUndefined();
      expect(engine.getRoom("LOBBY1")).toBeUndefined();
      expect(mockRepo.deleteGameState).toHaveBeenCalledWith("match", "DONE1");
      expect(mockRepo.deleteGameState).toHaveBeenCalledWith("match", "LOBBY1");
    });
  });
});
