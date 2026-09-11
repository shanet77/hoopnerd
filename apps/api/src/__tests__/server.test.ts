import supertest from "supertest";
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
// Use short timeouts for faster integration tests
process.env.TURN_TIMEOUT_MS = "1000";
process.env.DISCONNECT_GRACE_MS = "500";

import { createServer } from "../server";
import { Server as HttpServer } from "http";
import { io, Socket } from "socket.io-client";
import { GameRoomState, Player } from "@repo/types";
import { AddressInfo } from "net";
import { getConnectionDetails, validateMove } from "@repo/logic";
import type { Express } from "express";
import databasePool, { PgRepository } from "@repo/database";

// Mock the @repo/logic package
vi.mock("@repo/logic", () => {
  class MockCpuEngine {
    constructor(_deps: any) {}
    async getBestMove() {
      return null;
    }
  }
  return {
    __esModule: true,
    validateMove: vi.fn<typeof validateMove>(),
    getConnectionDetails: vi.fn<typeof getConnectionDetails>(),
    CpuEngine: MockCpuEngine,
  };
});
vi.mock("@repo/database", async () => {
  const actual = await vi.importActual<typeof import("@repo/database")>(
    "@repo/database",
  );
  return {
    __esModule: true,
    default: { query: vi.fn() },
    PgRepository: actual.PgRepository,
    InMemoryRepository: actual.InMemoryRepository,
  };
});

const mockValidateMove = validateMove as vi.Mock<typeof validateMove>;
const mockGetConnectionDetails = getConnectionDetails as vi.Mock<
  typeof getConnectionDetails
>;
const mockDbQuery = databasePool.query as unknown as vi.Mock<any>;

// Helper function to create a socket client
const createSocketClient = (port: number): Socket => {
  return io(`http://localhost:${port}`, {
    transports: ["websocket"],
    forceNew: true,
  });
};

describe("API Server", () => {
  let app: Express;
  let server: HttpServer;
  let port: number;

  beforeAll(async () => {
    const serverInstance = createServer();
    app = serverInstance.app;
    server = serverInstance.server;

    // Dynamically assign a port for testing
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        port = (server.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // Assign the mock to a variable for easier access and control
  beforeEach(() => {
    mockValidateMove.mockClear(); // Clear mock calls before each test
    mockGetConnectionDetails.mockClear();
    mockDbQuery.mockReset();
    mockDbQuery.mockResolvedValue({
      rows: [{ id: 1, name: "Tim Duncan", position: "PF" }],
    });
  });

  it("health check returns 200", async () => {
    await supertest(app)
      .get("/health")
      .expect(200)
      .then((res) => {
        expect(res.body.status).toBe("OK");
      });
  });

  it("player search endpoint works", async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ id: 10, name: "Tony Parker", position: "PG" }],
    });
    await supertest(app)
      .get("/api/players/search?q=test")
      .expect(200)
      .then((res) => {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body[0].name).toBe("Tony Parker");
      });
  });

  it("player search endpoint validates missing query", async () => {
    await supertest(app)
      .get("/api/players/search?q=")
      .expect(400)
      .then((res) => {
        expect(res.body.error).toContain("Query parameter");
      });
  });

  it("stats endpoint parses clamped window and timezone", async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ name: "Tim Duncan", count: 3 }] })
      .mockResolvedValueOnce({ rows: [{ name: "Spurs", count: 4 }] })
      .mockResolvedValueOnce({ rows: [{ seasonYear: 2005, count: 5 }] })
      .mockResolvedValueOnce({ rows: [{ longest: 8 }] });

    await supertest(app)
      .get("/api/stats?windowDays=900&tz=America%2FChicago")
      .expect(200)
      .then((res) => {
        expect(res.body.windowDays).toBe(365);
        expect(res.body.timezone).toBe("America/Chicago");
        expect(res.body.longestStreak).toBe(8);
        expect(res.body.players[0].name).toBe("Tim Duncan");
      });
  });

  describe("WebSocket Game Logic", () => {
    let client1: Socket;
    let client2: Socket;
    let player1: Player = { id: 1, name: "Player1", position: "G" };
    let player2: Player = { id: 2, name: "Player2", position: "F" };

    beforeEach(async () => {
      client1 = createSocketClient(port);
      client2 = createSocketClient(port);

      await Promise.all([
        new Promise<void>((resolve) => client1.on("connect", resolve)),
        new Promise<void>((resolve) => client2.on("connect", resolve)),
      ]);
    });

    afterEach(() => {
      client1.disconnect();
      client2.disconnect();
    });

    it("should allow a client to create a room and join it", (done) => {
      let roomId: string;
      client1.emit("create_room");
      client1.on("room_created", (response) => {
        roomId = response.roomId;
        client1.emit("join_room", { roomId, playerName: player1.name });
      });
      client1.on("room_joined", (response) => {
        expect(response.success).toBe(true);
        expect(response.roomState.roomId).toBe(roomId);
        expect(response.roomState.players).toHaveLength(1); // Only Player1 joined so far
        done();
      });
    });

    it("should allow a second client to join an existing room and start the game", (done) => {
      let roomId: string;
      let playersJoined = 0;

      client1.emit("create_room");
      client1.on("room_created", (response) => {
        roomId = response.roomId;
        client1.emit("join_room", { roomId, playerName: player1.name });
      });

      client1.on("room_joined", (response) => {
        expect(response.success).toBe(true);
        playersJoined++;
        if (playersJoined === 1) {
          // Client1 has joined
          client2.emit("join_room", { roomId, playerName: player2.name });
        }
      });

      client2.on("room_joined", (response) => {
        expect(response.success).toBe(true);
        expect(response.roomState.roomId).toBe(roomId);
        expect(response.roomState.players).toHaveLength(2); // Now both players are in the room
      });

      client1.on("game_started", (roomState: GameRoomState) => {
        expect(roomState.gameStarted).toBe(true);
        expect(roomState.players).toHaveLength(2);
        expect(roomState.currentPlayerIndex).toBeDefined();
        done();
      });
    });

    it("should reject duplicate player names in a room", (done) => {
      let roomId: string;

      client1.emit("create_room");
      client1.on("room_created", (response) => {
        roomId = response.roomId;
        client1.emit("join_room", { roomId, playerName: player1.name });
      });

      client1.on("room_joined", (response) => {
        expect(response.success).toBe(true);
        client2.emit("join_room", { roomId, playerName: player1.name });
      });

      client2.on("room_joined", (response) => {
        expect(response.success).toBe(false);
        expect(response.message.toLowerCase()).toContain("already in use");
        done();
      });
    });

    // it("should switch turns after a valid move", (done) => {
    //   let roomId: string;
    //   let initialPlayerTurn: Player;
    //   let nextPlayerTurn: Player;
    //   mockValidateMove.mockResolvedValue(true); // Mock valid move
    //   let playersJoined = 0;
    //
    //   client1.emit('create_room');
    //   client1.on('room_created', (response) => {
    //     roomId = response.roomId;
    //     client1.emit('join_room', { roomId, playerName: player1.name });
    //   });
    //
    //   client1.on('room_joined', (response) => {
    //     expect(response.success).toBe(true);
    //     playersJoined++;
    //     if (playersJoined === 1) {
    //       client2.emit('join_room', { roomId, playerName: player2.name });
    //     }
    //   });
    //
    //   client1.on('game_started', (roomState: GameRoomState) => {
    //     initialPlayerTurn = roomState.players[roomState.currentPlayerIndex];
    //     nextPlayerTurn = roomState.players[(roomState.currentPlayerIndex + 1) % roomState.players.length];
    //
    //     // Determine which client is the initial player and emit the move
    //     const activeClient = (initialPlayerTurn.name === player1.name) ? client1 : client2;
    //     activeClient.emit('submit_move', {
    //       roomId,
    //       player: initialPlayerTurn,
    //       connectedPlayer: nextPlayerTurn
    //     });
    //   });
    //
    //   client1.on('turn_changed', (player: Player) => {
    //     expect(player.name).toBe(nextPlayerTurn.name);
    //     expect(mockValidateMove).toHaveBeenCalledTimes(1);
    //     done();
    //   });
    // });

    // it("should not switch turns after an invalid move", (done) => {
    //   let roomId: string;
    //   let initialPlayerTurn: Player;
    //   mockValidateMove.mockResolvedValue(false); // Mock invalid move
    //   let playersJoined = 0;
    //
    //   client1.emit('create_room');
    //   client1.on('room_created', (response) => {
    //     roomId = response.roomId;
    //     client1.emit('join_room', { roomId, playerName: player1.name });
    //   });
    //
    //   client1.on('room_joined', (response) => {
    //     expect(response.success).toBe(true);
    //     playersJoined++;
    //     if (playersJoined === 1) {
    //       client2.emit('join_room', { roomId, playerName: player2.name });
    //     }
    //   });
    //
    //   client1.on('game_started', (roomState: GameRoomState) => {
    //     initialPlayerTurn = roomState.players[roomState.currentPlayerIndex];
    //
    //     const activeClient = (initialPlayerTurn.name === player1.name) ? client1 : client2;
    //     const otherPlayer = (initialPlayerTurn.name === player1.name) ? player2 : player1;
    //
    //     activeClient.emit('submit_move', {
    //       roomId,
    //       player: initialPlayerTurn,
    //       connectedPlayer: otherPlayer
    //     });
    //   });
    //
    //   // Listen for move_submitted response to ensure it was rejected
    //   client1.on('move_submitted', (data) => {
    //     expect(data.success).toBe(false);
    //     expect(mockValidateMove).toHaveBeenCalledTimes(1);
    //   });
    //
    //   // Use a timeout to ensure 'turn_changed' is NOT called
    //   const timeout = setTimeout(() => {
    //     expect(true).toBe(true); // If we reach here, turn_changed was not called
    //     done();
    //   }, 1000); // A short delay to allow for any unexpected 'turn_changed'
    //
    //   client1.on('turn_changed', () => {
    //     clearTimeout(timeout); // Clear the timeout if 'turn_changed' is erroneously called
    //     done(new Error('Turn should not have changed after an invalid move.'));
    //   });
    // });

    it("should end the game if a player times out", (done) => {
      let roomId: string;
      let gameStarted = false;
      let playersJoined = 0;

      client1.emit("create_room");
      client1.on("room_created", (response) => {
        roomId = response.roomId;
        client1.emit("join_room", { roomId, playerName: player1.name });
      });

      client1.on("room_joined", (response) => {
        expect(response.success).toBe(true);
        playersJoined++;
        if (playersJoined === 1) {
          client2.emit("join_room", { roomId, playerName: player2.name });
        }
      });

      client1.on("game_started", () => {
        if (!gameStarted) {
          gameStarted = true;
          // Do nothing to simulate a timeout
        }
      });

      client1.on("game_over", (data) => {
        expect(data.winner).toBeDefined();
        expect(data.reason).toContain("timed out");
        done();
      });
    }, 5000); // Uses TURN_TIMEOUT_MS=1000 (set via env at top of file)

    it("should end the game if a player disconnects", (done) => {
      let roomId: string;
      let gameStarted = false;

      client1.emit("create_room");
      client1.on("room_created", (response) => {
        roomId = response.roomId;
        client1.emit("join_room", { roomId, playerName: player1.name });
      });

      client1.on("room_joined", (response) => {
        expect(response.success).toBe(true);
        client2.emit("join_room", { roomId, playerName: player2.name });
      });

      client2.on("room_joined", (response) => {
        expect(response.success).toBe(true);
      });

      client1.on("game_started", () => {
        if (!gameStarted) {
          gameStarted = true;
          client2.disconnect(); // Disconnect client2
        }
      });

      client1.on("game_over", (data) => {
        expect(data.winner).toBeDefined();
        expect(data.reason).toContain("disconnected");
        done();
      });
    }, 5000); // Uses DISCONNECT_GRACE_MS=500 (set via env at top of file)
  });
});
