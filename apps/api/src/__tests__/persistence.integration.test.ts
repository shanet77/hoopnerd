import { describe, it, expect, beforeAll, afterAll } from "vitest";

process.env.TURN_TIMEOUT_MS = "60000";
process.env.DISCONNECT_GRACE_MS = "60000";

import { createServer } from "../server";
import { createInMemoryRepositories } from "@repo/database";
import { Server as HttpServer } from "http";
import { AddressInfo } from "net";
import { io, Socket } from "socket.io-client";
import type { GameRoomState, Player } from "@repo/types";

const ROOM_ID = "PERSIST";

const players: Player[] = [
  { id: 1, name: "Tim Duncan", position: "PF" },
  { id: 2, name: "Tony Parker", position: "PG" },
  { id: 3, name: "Manu Ginobili", position: "SG" },
];

const rosterEdges: Array<[number, number, number, string]> = [
  [1, 2, 2005, "San Antonio Spurs"],
  [2, 3, 2007, "San Antonio Spurs"],
];

const createRepositories = () => {
  const repositories = createInMemoryRepositories();
  repositories.players.seedPlayers(players);
  for (const [playerId, teammateId, seasonYear, teamName] of rosterEdges) {
    repositories.players.seedRoster(playerId, teammateId, seasonYear, 1, teamName);
    repositories.players.seedRoster(teammateId, playerId, seasonYear, 1, teamName);
  }
  return repositories;
};

const listen = (server: HttpServer): Promise<number> =>
  new Promise((resolve) => {
    server.listen(0, () => resolve((server.address() as AddressInfo).port));
  });

const close = (server: HttpServer): Promise<void> =>
  new Promise((resolve) => server.close(() => resolve()));

const connect = (port: number): Socket =>
  io(`http://localhost:${port}`, {
    transports: ["websocket"],
    forceNew: true,
  });

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

const neighborOf = (playerId: number): Player => {
  const edge = rosterEdges.find(
    ([from, to]) => from === playerId || to === playerId,
  );
  if (!edge) throw new Error(`No roster edge from player ${playerId}`);
  const neighborId = edge[0] === playerId ? edge[1] : edge[0];
  return players.find((player) => player.id === neighborId)!;
};

describe("Active game persistence across API restarts", () => {
  let first: ReturnType<typeof createServer>;
  let second: ReturnType<typeof createServer> | undefined;
  const sockets: Socket[] = [];

  beforeAll(() => {
    process.env.TURN_TIMEOUT_MS = "60000";
    process.env.DISCONNECT_GRACE_MS = "60000";
  });

  afterAll(async () => {
    for (const socket of sockets) socket.close();
    if (second) {
      second.matchEngine.stop();
      second.soloEngine.stop();
      await close(second.server);
    }
    if (first) {
      first.matchEngine.stop();
      first.soloEngine.stop();
      await close(first.server);
    }
  });

  it("restores a started room and lets both players rejoin", async () => {
    const repositories = createRepositories();
    first = createServer({ repositories });
    const firstPort = await listen(first.server);

    const alice = connect(firstPort);
    const bob = connect(firstPort);
    sockets.push(alice, bob);

    const aliceJoin = await emitAndWait<{
      success: boolean;
      playerToken?: string;
      playerId?: number;
    }>(alice, "join_room", { roomId: ROOM_ID, playerName: "Alice" }, "room_joined");
    expect(aliceJoin.success).toBe(true);

    const gameStarted = new Promise<GameRoomState>((resolve) => {
      alice.once("game_started", resolve);
    });

    const bobJoin = await emitAndWait<{
      success: boolean;
      playerToken?: string;
      playerId?: number;
      roomState?: GameRoomState;
    }>(bob, "join_room", { roomId: ROOM_ID, playerName: "Bob" }, "room_joined");
    expect(bobJoin.success).toBe(true);

    const startedRoom = await gameStarted;
    const startingPlayer = startedRoom.startingPlayer!;
    const mover = startedRoom.players[startedRoom.currentPlayerIndex];
    const moverToken = mover.id === aliceJoin.playerId
      ? aliceJoin.playerToken!
      : bobJoin.playerToken!;
    const moverSocket = mover.id === aliceJoin.playerId ? alice : bob;
    const connectedPlayer = neighborOf(startingPlayer.id);

    const moveResult = await emitAndWait<{ success: boolean }>(
      moverSocket,
      "submit_move",
      {
        roomId: ROOM_ID,
        playerToken: moverToken,
        connectedPlayer,
      },
      "move_submitted",
    );
    expect(moveResult.success).toBe(true);

    alice.close();
    bob.close();
    first.matchEngine.stop();
    first.soloEngine.stop();
    await close(first.server);

    second = createServer({ repositories });
    await second.matchEngine.restore();
    await second.soloEngine.restore();
    const secondPort = await listen(second.server);

    const aliceAgain = connect(secondPort);
    const bobAgain = connect(secondPort);
    sockets.push(aliceAgain, bobAgain);

    const aliceRejoin = await emitAndWait<{
      success: boolean;
      roomState?: GameRoomState;
    }>(
      aliceAgain,
      "join_room",
      {
        roomId: ROOM_ID,
        playerName: "Alice",
        playerToken: aliceJoin.playerToken,
      },
      "room_joined",
    );
    expect(aliceRejoin.success).toBe(true);
    expect(aliceRejoin.roomState?.gameStarted).toBe(true);
    expect(aliceRejoin.roomState?.moves).toHaveLength(1);
    expect(aliceRejoin.roomState?.moves[0].playerId).toBe(connectedPlayer.id);

    const bobRejoin = await emitAndWait<{
      success: boolean;
      roomState?: GameRoomState;
    }>(
      bobAgain,
      "join_room",
      {
        roomId: ROOM_ID,
        playerName: "Bob",
        playerToken: bobJoin.playerToken,
      },
      "room_joined",
    );
    expect(bobRejoin.success).toBe(true);
    expect(bobRejoin.roomState?.players).toHaveLength(2);
  });
});
