import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryRepository } from "@repo/database";
import { recordGameStats } from "../StatsRecorder";
import type { GameRoomState, PlayerConnection } from "@repo/types";

function makeRoom(overrides: Partial<GameRoomState> = {}): GameRoomState {
  return {
    roomId: "TEST1",
    players: [],
    moves: [],
    currentPlayerIndex: 0,
    gameStarted: true,
    gameCompleted: true,
    winner: null,
    startingPlayer: null,
    connections: [],
    lastConnectedPlayer: null,
    friendsOnly: false,
    statsRecorded: false,
    ...overrides,
  };
}

describe("recordGameStats", () => {
  let repo: InMemoryRepository;

  beforeEach(() => {
    repo = new InMemoryRepository();
  });

  it("should not record if stats already recorded", async () => {
    const room = makeRoom({ statsRecorded: true });
    await recordGameStats(repo, room);
    expect(repo.getStats(7, "UTC")).resolves.toHaveProperty("longestStreak", 0);
  });

  it("should mark stats as recorded after running", async () => {
    const room = makeRoom({
      moves: [{ playerId: 10, playerName: "PlayerX", position: "C" }],
    });
    await recordGameStats(repo, room);
    expect(room.statsRecorded).toBe(true);
  });

  it("should record a streak row even with no moves or connections", async () => {
    const room = makeRoom();
    await recordGameStats(repo, room);
    const stats = await repo.getStats(365, "UTC");
    expect(stats.longestStreak).toBe(0);
    expect(stats.players).toHaveLength(0);
  });

  it("should record moves as player events", async () => {
    const room = makeRoom({
      moves: [
        { playerId: 10, playerName: "PlayerA", position: "C" },
        { playerId: 20, playerName: "PlayerB", position: "G" },
      ],
    });
    await recordGameStats(repo, room);
    const stats = await repo.getStats(365, "UTC");
    expect(stats.players).toHaveLength(2);
    expect(stats.players[0].name).toBe("PlayerA");
    expect(stats.players[1].name).toBe("PlayerB");
  });

  it("should not record stats twice for the same room", async () => {
    const room = makeRoom({
      moves: [{ playerId: 1, playerName: "Unique", position: "C" }],
    });
    await recordGameStats(repo, room);
    await recordGameStats(repo, room);
    const stats = await repo.getStats(365, "UTC");
    expect(stats.players).toHaveLength(1);
  });
});
