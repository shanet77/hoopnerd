import { describe, it, expect, beforeEach, vi } from "vitest";
import { recordGameStats } from "../StatsRecorder";
import { GameRoomState, PlayerConnection } from "@repo/types";
import databasePool from "@repo/database";

vi.mock("@repo/database", () => ({
  __esModule: true,
  default: {
    query: vi.fn(),
  },
}));

const mockDbQuery = databasePool.query as unknown as vi.Mock;

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

function makeConnection(
  overrides: Partial<PlayerConnection> = {}
): PlayerConnection {
  return {
    fromPlayer: { id: 1, name: "A", position: "G" },
    toPlayer: { id: 2, name: "B", position: "F" },
    ...overrides,
  };
}

describe("recordGameStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbQuery.mockResolvedValue({ rows: [] });
  });

  it("should not record if stats already recorded", async () => {
    const room = makeRoom({ statsRecorded: true });

    await recordGameStats(room);

    expect(mockDbQuery).not.toHaveBeenCalled();
  });

  it("should mark stats as recorded after running", async () => {
    const room = makeRoom({
      moves: [{ playerId: 10, playerName: "PlayerX", position: "C" }],
    });

    await recordGameStats(room);

    expect(room.statsRecorded).toBe(true);
  });

  it("should record a streak row even with no moves or connections", async () => {
    const room = makeRoom();

    await recordGameStats(room);

    expect(mockDbQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockDbQuery.mock.calls[0];
    expect(sql).toContain("INSERT INTO stats_events");
    // Single streak row with 0 connections
    expect(params[0]).toBe("streak");
    expect(params[4]).toBe(0);
  });

  it("should record moves as player events", async () => {
    const room = makeRoom({
      moves: [
        { playerId: 10, playerName: "PlayerA", position: "C" },
        { playerId: 20, playerName: "PlayerB", position: "G" },
      ],
    });

    await recordGameStats(room);

    expect(mockDbQuery).toHaveBeenCalledTimes(1);

    const [sql, params] = mockDbQuery.mock.calls[0];
    expect(sql).toContain("INSERT INTO stats_events");
    // Row layout (5 params each):
    //   row0: ['player', 'PlayerA', null, null, null]  → params[0..4]
    //   row1: ['player', 'PlayerB', null, null, null]  → params[5..9]
    //   row2: ['streak', null, null, null, 0]          → params[10..14]
    expect(params[0]).toBe("player");
    expect(params[1]).toBe("PlayerA");
    expect(params[5]).toBe("player");
    expect(params[6]).toBe("PlayerB");
    expect(params[10]).toBe("streak");
    expect(params[14]).toBe(0);
  });

  it("should record connection teams", async () => {
    const room = makeRoom({
      connections: [makeConnection({ teamName: "Lakers" })],
    });

    await recordGameStats(room);

    const params = mockDbQuery.mock.calls[0][1];
    // team row + streak row = 2 rows = 10 params
    expect(params).toHaveLength(10);
    expect(params[0]).toBe("team");
    expect(params[1]).toBeNull();
    expect(params[2]).toBe("Lakers");
    expect(params[3]).toBeNull();
    expect(params[4]).toBeNull();
    // streak row
    expect(params[5]).toBe("streak");
    expect(params[9]).toBe(1);
  });

  it("should record connection season years", async () => {
    const room = makeRoom({
      connections: [makeConnection({ seasonYear: 1996 })],
    });

    await recordGameStats(room);

    const params = mockDbQuery.mock.calls[0][1];
    // season row + streak row
    expect(params[0]).toBe("season");
    expect(params[3]).toBe(1996);
    expect(params[5]).toBe("streak");
    expect(params[9]).toBe(1);
  });

  it("should record connection with both team and season", async () => {
    const room = makeRoom({
      connections: [makeConnection({ teamName: "Bulls", seasonYear: 1996 })],
    });

    await recordGameStats(room);

    const params = mockDbQuery.mock.calls[0][1];
    // team row: params[0..4]
    expect(params[0]).toBe("team");
    expect(params[2]).toBe("Bulls");
    // season row: params[5..9]
    expect(params[5]).toBe("season");
    expect(params[8]).toBe(1996);
    // streak row: params[10..14]
    expect(params[10]).toBe("streak");
    expect(params[14]).toBe(1);
  });

  it("should record streak count matching connections length", async () => {
    const room = makeRoom({
      connections: [
        makeConnection({ teamName: "Celtics" }),
        makeConnection({ teamName: "Lakers" }),
        makeConnection({ teamName: "Bulls", seasonYear: 1991 }),
      ],
      moves: [{ playerId: 1, playerName: "X", position: "C" }],
    });

    await recordGameStats(room);

    const params = mockDbQuery.mock.calls[0][1];
    // 1 move + 3 teams + 1 season + 1 streak = 6 rows = 30 params
    // streak is last row, so at offset (6-1)*5 = 25
    expect(params[25]).toBe("streak");
    expect(params[29]).toBe(3);
  });

  it("should skip connections without team or season", async () => {
    const room = makeRoom({
      connections: [makeConnection()],
    });

    await recordGameStats(room);

    const params = mockDbQuery.mock.calls[0][1];
    // Only the streak row
    expect(params[0]).toBe("streak");
    expect(params[4]).toBe(1);
  });

  it("should handle a room with both moves and connections", async () => {
    const room = makeRoom({
      moves: [
        { playerId: 1, playerName: "Alpha", position: "G" },
        { playerId: 2, playerName: "Beta", position: "F" },
      ],
      connections: [
        makeConnection({ teamName: "Raptors" }),
        makeConnection({ teamName: "Warriors", seasonYear: 2022 }),
      ],
    });

    await recordGameStats(room);

    const params = mockDbQuery.mock.calls[0][1];
    // 2 moves + 2 teams + 1 season + 1 streak = 6 rows * 5 = 30 params
    expect(params).toHaveLength(30);
    expect(params[0]).toBe("player");
    expect(params[1]).toBe("Alpha");
    expect(params[5]).toBe("player");
    expect(params[6]).toBe("Beta");
    expect(params[10]).toBe("team");
    expect(params[12]).toBe("Raptors");
    expect(params[15]).toBe("team");
    expect(params[17]).toBe("Warriors");
    expect(params[20]).toBe("season");
    expect(params[23]).toBe(2022);
    expect(params[25]).toBe("streak");
    expect(params[29]).toBe(2);
  });

  it("should not record stats twice for the same room", async () => {
    const room = makeRoom({
      moves: [{ playerId: 1, playerName: "Unique", position: "C" }],
    });

    await recordGameStats(room);
    await recordGameStats(room);

    expect(mockDbQuery).toHaveBeenCalledTimes(1);
  });
});
