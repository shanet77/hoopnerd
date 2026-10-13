import supertest from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "../server";
import { Server as HttpServer } from "http";
import { io, Socket } from "socket.io-client";
import type { Player } from "@repo/types";
import { AddressInfo } from "net";
import type { Express } from "express";
import { InMemoryRepository } from "@repo/database";

const USER_ID = "11111111-2222-3333-4444-555555555555";

const seededPlayers: Player[] = [
  { id: 1, name: "Tim Duncan", position: "PF" },
  { id: 2, name: "Tony Parker", position: "PG" },
  { id: 3, name: "Manu Ginobili", position: "SG" },
  { id: 4, name: "Robert Horry", position: "PF" },
  { id: 5, name: "Bruce Bowen", position: "SF" },
];

const undirected = (
  a: number,
  b: number,
  seasonYear: number,
  teamName: string,
) => [
  [a, b, seasonYear, teamName],
  [b, a, seasonYear, teamName],
];

const rosterEdges = [
  ...undirected(1, 2, 2005, "San Antonio Spurs"),
  ...undirected(2, 3, 2007, "San Antonio Spurs"),
  ...undirected(2, 4, 2005, "San Antonio Spurs"),
  ...undirected(1, 5, 2005, "San Antonio Spurs"),
];

const adjacency = new Map<number, number[]>([
  [1, [2, 5]],
  [2, [1, 3, 4]],
  [3, [2]],
  [4, [2]],
  [5, [1]],
]);

const playerById = (id: number) =>
  seededPlayers.find((player) => player.id === id)!;

const firstUnusedNeighbor = (currentId: number, used: Set<number>) =>
  (adjacency.get(currentId) ?? []).find((id) => !used.has(id));

const nonNeighborOf = (currentId: number) =>
  seededPlayers.find(
    (player) =>
      player.id !== currentId &&
      !(adjacency.get(currentId) ?? []).includes(player.id),
  )!;

const emitAndWait = <T>(
  client: Socket,
  event: string,
  payload: unknown,
  responseEvent: string,
): Promise<T> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`${event} timed out`)),
      5000,
    );
    client.once(responseEvent, (response: T) => {
      clearTimeout(timeout);
      resolve(response);
    });
    client.emit(event, payload);
  });

describe("Solo streak mode (end-to-end)", () => {
  let app: Express;
  let server: HttpServer;
  let port: number;
  let client: Socket;
  let repository: InMemoryRepository;

  beforeAll(async () => {
    repository = new InMemoryRepository();
    repository.seedPlayers(seededPlayers);
    for (const [playerId, teammateId, seasonYear, teamName] of rosterEdges) {
      repository.seedRoster(playerId, teammateId, seasonYear, 1, teamName);
    }

    const serverInstance = createServer({ repository });
    app = serverInstance.app;
    server = serverInstance.server;

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        port = (server.address() as AddressInfo).port;
        resolve();
      });
    });

    client = io(`http://localhost:${port}`, {
      transports: ["websocket"],
      forceNew: true,
    });
    await new Promise<void>((resolve) => client.on("connect", resolve));
  });

  afterAll(async () => {
    client.disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const createRun = () =>
    emitAndWait<any>(
      client,
      "create_solo_run",
      { userId: USER_ID, displayName: "Shane" },
      "solo_run_created",
    );

  it("runs a full chain until stuck and records the streak", async () => {
    const created = await createRun();
    expect(created.success).toBe(true);
    expect(created.runToken).toBeDefined();

    const runState = created.runState;
    const used = new Set<number>([runState.startingPlayer.id]);
    let currentId = runState.startingPlayer.id;
    let moves = 0;

    let neighbor = firstUnusedNeighbor(currentId, used);
    while (neighbor !== undefined) {
      const response = await emitAndWait<any>(
        client,
        "submit_solo_move",
        {
          runId: runState.roomId,
          runToken: created.runToken,
          connectedPlayer: playerById(neighbor),
        },
        "solo_move_result",
      );

      moves += 1;
      used.add(neighbor);
      currentId = neighbor;

      const nextNeighbor = firstUnusedNeighbor(currentId, used);
      if (nextNeighbor === undefined) {
        expect(response.success).toBe(true);
        expect(response.ended).toBe(true);
        expect(response.endReason).toBe("stuck");
        expect(response.streak).toBe(moves);
        expect(response.isNewBest).toBe(true);
      } else {
        expect(response.success).toBe(true);
        expect(response.ended).toBeUndefined();
        expect(response.streak).toBe(moves);
      }
      neighbor = nextNeighbor;
    }

    const leaderboard = await supertest(app)
      .get("/api/solo/leaderboard")
      .expect(200);
    expect(leaderboard.body).toEqual([
      { userId: USER_ID, name: "Shane", streak: moves },
    ]);

    const best = await supertest(app)
      .get(`/api/solo/best?userId=${USER_ID}`)
      .expect(200);
    expect(best.body.bestStreak).toBe(moves);
  });

  it("ends the run on a repeat submission", async () => {
    const created = await createRun();
    const starterId = created.runState.startingPlayer.id;

    const response = await emitAndWait<any>(
      client,
      "submit_solo_move",
      {
        runId: created.runState.roomId,
        runToken: created.runToken,
        connectedPlayer: playerById(starterId),
      },
      "solo_move_result",
    );

    expect(response.success).toBe(false);
    expect(response.ended).toBe(true);
    expect(response.endReason).toBe("repeat");
    expect(response.streak).toBe(0);
  });

  it("ends the run on an invalid connection", async () => {
    const created = await createRun();
    const starterId = created.runState.startingPlayer.id;
    const outsider = nonNeighborOf(starterId);

    const response = await emitAndWait<any>(
      client,
      "submit_solo_move",
      {
        runId: created.runState.roomId,
        runToken: created.runToken,
        connectedPlayer: outsider,
      },
      "solo_move_result",
    );

    expect(response.success).toBe(false);
    expect(response.ended).toBe(true);
    expect(response.endReason).toBe("invalid");
    expect(response.streak).toBe(0);
  });

  it("resumes a run with its token and rejects stale ones", async () => {
    const created = await createRun();
    const runId = created.runState.roomId;
    const runToken = created.runToken;

    const neighbor = firstUnusedNeighbor(
      created.runState.startingPlayer.id,
      new Set([created.runState.startingPlayer.id]),
    )!;

    await emitAndWait<any>(
      client,
      "submit_solo_move",
      {
        runId,
        runToken,
        connectedPlayer: playerById(neighbor),
      },
      "solo_move_result",
    );

    const resumed = await emitAndWait<any>(
      client,
      "resume_solo_run",
      { runId, runToken },
      "solo_run_resumed",
    );
    expect(resumed.success).toBe(true);
    expect(resumed.runState.moves).toHaveLength(1);

    const stale = await emitAndWait<any>(
      client,
      "resume_solo_run",
      { runId: "WRONG1", runToken },
      "solo_run_resumed",
    );
    expect(stale.success).toBe(false);

    const ended = await emitAndWait<any>(
      client,
      "end_solo_run",
      { runId, runToken },
      "solo_run_ended",
    );
    expect(ended.success).toBe(true);
    expect(ended.streak).toBe(1);
    expect(ended.endReason).toBe("forfeit");
  });

  it("keeps one best streak per user across runs", async () => {
    const best = await supertest(app)
      .get(`/api/solo/best?userId=${USER_ID}`)
      .expect(200);
    expect(best.body.bestStreak).toBeGreaterThanOrEqual(2);
  });
});
