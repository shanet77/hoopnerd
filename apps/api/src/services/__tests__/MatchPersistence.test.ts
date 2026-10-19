import { describe, it, expect, vi } from "vitest";
import { buildTestPlayer, buildTestRoom } from "@repo/types";
import type { GameRoomState, PersistedMatchGame } from "@repo/types";
import {
  isSnapshotRestorable,
  MatchPersistence,
  type SnapshotRestorePolicy,
} from "../match/MatchPersistence";

const startedRoom = (roomId = "R1"): GameRoomState =>
  buildTestRoom(roomId, {
    gameStarted: true,
    players: [
      buildTestPlayer({ id: 1, name: "Player1" }),
      buildTestPlayer({ id: 2, name: "Player2" }),
    ],
  });

const record = (
  state: PersistedMatchGame,
  updatedAt = new Date(),
  id = "R1",
) => ({ id, state, updatedAt });

const snapshot = (
  room: GameRoomState = buildTestRoom("R1"),
  cpuDifficulty?: "easy",
): PersistedMatchGame => ({
  version: 1,
  room,
  ...(cpuDifficulty ? { cpuDifficulty } : {}),
});

describe("isSnapshotRestorable", () => {
  const policy: SnapshotRestorePolicy = {
    lobbyTtlMs: 1000,
    hasCpuEngine: false,
    now: 10_000,
  };

  it("accepts a fresh lobby", () => {
    expect(
      isSnapshotRestorable(record(snapshot(), new Date(9_500)), policy),
    ).toBe(true);
  });

  it("rejects a lobby older than the idle TTL", () => {
    expect(
      isSnapshotRestorable(record(snapshot(), new Date(8_000)), policy),
    ).toBe(false);
  });

  it("accepts a started room regardless of age", () => {
    expect(
      isSnapshotRestorable(
        record(snapshot(startedRoom()), new Date(0)),
        policy,
      ),
    ).toBe(true);
  });

  it("rejects a started room with fewer than two players", () => {
    const room = buildTestRoom("R1", {
      gameStarted: true,
      players: [buildTestPlayer({ id: 1 })],
    });
    expect(isSnapshotRestorable(record(snapshot(room)), policy)).toBe(false);
  });

  it("rejects a completed room", () => {
    const room = buildTestRoom("R1", { gameCompleted: true });
    expect(isSnapshotRestorable(record(snapshot(room)), policy)).toBe(false);
  });

  it("rejects an unknown snapshot version", () => {
    const state = { ...snapshot(), version: 2 } as unknown as PersistedMatchGame;
    expect(isSnapshotRestorable(record(state), policy)).toBe(false);
  });

  it("rejects a missing snapshot", () => {
    const state = undefined as unknown as PersistedMatchGame;
    expect(isSnapshotRestorable(record(state), policy)).toBe(false);
  });

  it("rejects a CPU game when no CPU engine is configured", () => {
    expect(
      isSnapshotRestorable(record(snapshot(startedRoom(), "easy")), policy),
    ).toBe(false);
  });

  it("accepts a CPU game when a CPU engine is configured", () => {
    expect(
      isSnapshotRestorable(record(snapshot(startedRoom(), "easy")), {
        ...policy,
        hasCpuEngine: true,
      }),
    ).toBe(true);
  });
});

describe("MatchPersistence", () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("never lets a delete overtake a save for the same room", async () => {
    const calls: string[] = [];
    let releaseSave!: () => void;
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });

    const gameStates = {
      saveGameState: vi.fn(async () => {
        calls.push("save:start");
        await saveGate;
        calls.push("save:end");
      }),
      deleteGameState: vi.fn(async () => {
        calls.push("delete");
      }),
    };

    const persistence = new MatchPersistence(gameStates as any);

    const save = persistence.save("R1", buildTestRoom("R1"));
    const del = persistence.delete("R1");

    await flush();
    expect(calls).toEqual(["save:start"]);
    expect(gameStates.deleteGameState).not.toHaveBeenCalled();

    releaseSave();
    await Promise.all([save, del]);

    expect(calls).toEqual(["save:start", "save:end", "delete"]);
  });

  it("swallows a failed write and still runs the next write", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const deleteGameState = vi.fn().mockResolvedValue(undefined);
    const gameStates = {
      saveGameState: vi.fn().mockRejectedValue(new Error("boom")),
      deleteGameState,
    };

    const persistence = new MatchPersistence(gameStates as any);
    const save = persistence.save("R1", buildTestRoom("R1"));
    const del = persistence.delete("R1");

    await Promise.all([save, del]);

    expect(deleteGameState).toHaveBeenCalledWith("match", "R1");
    errorSpy.mockRestore();
  });

  it("does not block a different room behind a slow write", async () => {
    let releaseSave!: () => void;
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const gameStates = {
      saveGameState: vi.fn(async (kind: string, roomId: string) => {
        if (roomId === "SLOW") await saveGate;
      }),
      deleteGameState: vi.fn().mockResolvedValue(undefined),
    };

    const persistence = new MatchPersistence(gameStates as any);
    const slow = persistence.save("SLOW", buildTestRoom("SLOW"));
    const fast = persistence.delete("FAST");

    await fast;
    expect(gameStates.deleteGameState).toHaveBeenCalledWith("match", "FAST");

    releaseSave();
    await slow;
  });

  it("restore deletes unusable records and hydrates the rest", async () => {
    const usable = snapshot(startedRoom("KEEP"));
    const unusable = snapshot(buildTestRoom("DROP", { gameCompleted: true }));
    const gameStates = {
      loadGameStates: vi.fn().mockResolvedValue([
        record(usable, new Date(), "KEEP"),
        record(unusable, new Date(), "DROP"),
      ]),
      deleteGameState: vi.fn().mockResolvedValue(undefined),
    };

    const persistence = new MatchPersistence(gameStates as any);
    const restored: string[] = [];

    await persistence.restore(
      { lobbyTtlMs: 1000, hasCpuEngine: false },
      (roomId) => restored.push(roomId),
    );

    expect(restored).toEqual(["KEEP"]);
    expect(gameStates.deleteGameState).toHaveBeenCalledWith("match", "DROP");
  });
});
