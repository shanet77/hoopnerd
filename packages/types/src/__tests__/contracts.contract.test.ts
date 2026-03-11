import { describe, expect, it } from "@jest/globals";
import type {
  GameRoomState,
  JoinMatchmakingResponse,
  JoinRoomResponse,
  SubmitMoveResponse,
} from "..";
import { buildTestPlayer, buildTestRoom } from "..";

describe("@repo/types contracts", () => {
  it("models room join and move responses with required fields", () => {
    const roomState: GameRoomState = buildTestRoom("ROOM42", {
      players: [buildTestPlayer({ id: 1, name: "Player 1" })],
    });

    const join: JoinRoomResponse = {
      success: true,
      message: "ok",
      roomState,
      playerToken: "token",
      playerId: 1,
    };

    const move: SubmitMoveResponse = {
      success: true,
      message: "ok",
      validated: true,
      roomState,
    };

    const matchmaking: JoinMatchmakingResponse = {
      success: true,
      message: "ok",
      roomId: roomState.roomId,
      roomState,
      joinedExisting: true,
      playerToken: "token",
      playerId: 1,
    };

    expect(join.success).toBe(true);
    expect(move.validated).toBe(true);
    expect(matchmaking.joinedExisting).toBe(true);
  });
});
