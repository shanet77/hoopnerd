import { describe, expect, it } from "@jest/globals";
import type {
  JoinRoomRequest,
  JoinRoomResponse,
  SubmitMoveRequest,
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

    expect(joinRequest.roomId).toBe("ROOM1");
    expect(joinResponse.success).toBe(true);
    expect(moveRequest.connectedPlayer.name).toBe("Tony Parker");
    expect(emitEvent).toBe("room_joined");
  });
});
