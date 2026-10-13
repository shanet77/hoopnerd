import { describe, expect, it } from "vitest";
import type {
  CreateSoloRunRequest,
  CreateSoloRunResponse,
  EndSoloRunRequest,
  JoinRoomRequest,
  JoinRoomResponse,
  SubmitMoveRequest,
  SubmitSoloMoveRequest,
  SubmitSoloMoveResponse,
  WebSocketEvents,
} from "@repo/types";

describe("API/WebSocket contract typing", () => {
  it("keeps request and response payloads aligned with shared types", () => {
    const joinRequest: JoinRoomRequest = {
      roomId: "ROOM1",
      playerName: "Tim Duncan",
      playerToken: "token",
    };

    const joinResponse: JoinRoomResponse = {
      success: true,
      message: "ok",
      playerToken: "token",
      playerId: 1,
    };

    const moveRequest: SubmitMoveRequest = {
      roomId: "ROOM1",
      playerToken: "token",
      connectedPlayer: { id: 2, name: "Tony Parker", position: "PG" },
    };

    const emitEvent: keyof WebSocketEvents = "room_joined";

    const soloCreateRequest: CreateSoloRunRequest = {
      userId: "11111111-2222-3333-4444-555555555555",
      displayName: "Tim Duncan",
    };

    const soloCreateResponse: CreateSoloRunResponse = {
      success: true,
      message: "Solo run created!",
      runState: {
        roomId: "RUN123",
        userId: "11111111-2222-3333-4444-555555555555",
        displayName: "Tim Duncan",
        players: [],
        moves: [],
        currentPlayerIndex: 0,
        gameStarted: true,
        gameCompleted: false,
        winner: null,
        startingPlayer: null,
        connections: [],
        lastConnectedPlayer: null,
        friendsOnly: false,
        statsRecorded: false,
      },
      runToken: "token",
    };

    const soloMoveRequest: SubmitSoloMoveRequest = {
      runId: "RUN123",
      runToken: "token",
      connectedPlayer: { id: 2, name: "Tony Parker", position: "PG" },
    };

    const soloMoveResponse: SubmitSoloMoveResponse = {
      success: true,
      message: "Connected!",
      move: { playerId: 2, playerName: "Tony Parker", position: "PG" },
      connection: null,
      streak: 1,
    };

    const soloEndRequest: EndSoloRunRequest = { runId: "RUN123", runToken: "token" };

    const soloEmitEvent: keyof WebSocketEvents = "solo_move_result";

    expect(joinRequest.roomId).toBe("ROOM1");
    expect(joinResponse.success).toBe(true);
    expect(moveRequest.connectedPlayer.name).toBe("Tony Parker");
    expect(emitEvent).toBe("room_joined");
    expect(soloCreateRequest.displayName).toBe("Tim Duncan");
    expect(soloCreateResponse.runState?.roomId).toBe("RUN123");
    expect(soloMoveRequest.connectedPlayer.name).toBe("Tony Parker");
    expect(soloMoveResponse.streak).toBe(1);
    expect(soloEndRequest.runId).toBe("RUN123");
    expect(soloEmitEvent).toBe("solo_move_result");
  });
});
