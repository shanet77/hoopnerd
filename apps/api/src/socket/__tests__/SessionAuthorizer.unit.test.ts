import { describe, it, expect, beforeEach } from "vitest";
import type { GameRoomState, Player } from "@repo/types";
import type { MatchEngine } from "../../services/MatchEngine";
import { issueSessionToken } from "../../socketAuth";
import {
  AuthError,
  AuthErrorCode,
  SessionAuthorizer,
} from "../SessionAuthorizer";

const ROOM_ID = "ROOM1";
const SOCKET_ID = "socket-1";
const PLAYER_ID = 42;

function makeEngine(
  room: GameRoomState | undefined,
  binding?: { roomId: string; playerId: number },
): MatchEngine {
  return {
    getSocketBinding: () => binding,
    getRoom: () => room,
  } as unknown as MatchEngine;
}

function makeRoom(players: Player[]): GameRoomState {
  return {
    roomId: ROOM_ID,
    players,
    currentPlayerIndex: 0,
  } as unknown as GameRoomState;
}

describe("SessionAuthorizer", () => {
  const player: Player = {
    id: PLAYER_ID,
    name: "Alice",
    position: "G",
  };
  let token: string;

  beforeEach(() => {
    process.env.SOCKET_SESSION_SECRET = "test-secret";
    token = issueSessionToken(ROOM_ID, PLAYER_ID);
  });

  describe("verifyToken", () => {
    it("returns claims for a valid token", () => {
      const authorizer = new SessionAuthorizer(makeEngine(undefined));

      expect(authorizer.verifyToken(token)).toMatchObject({
        roomId: ROOM_ID,
        playerId: PLAYER_ID,
      });
    });

    it("throws when the token is missing", () => {
      const authorizer = new SessionAuthorizer(makeEngine(undefined));

      expect(() => authorizer.verifyToken(undefined)).toThrowError(AuthError);
    });

    it("throws when the token is invalid", () => {
      const authorizer = new SessionAuthorizer(makeEngine(undefined));

      try {
        authorizer.verifyToken("bad-token");
        expect.unreachable("expected an AuthError");
      } catch (error) {
        expect((error as AuthError).code).toBe(AuthErrorCode.INVALID_TOKEN);
      }
    });
  });

  describe("authorize", () => {
    it("returns a typed actor context for a valid bound session", () => {
      const room = makeRoom([player]);
      const authorizer = new SessionAuthorizer(
        makeEngine(room, { roomId: ROOM_ID, playerId: PLAYER_ID }),
      );

      const actor = authorizer.authorize(SOCKET_ID, token, ROOM_ID);

      expect(actor.playerId).toBe(PLAYER_ID);
      expect(actor.roomId).toBe(ROOM_ID);
      expect(actor.player).toBe(player);
      expect(actor.room).toBe(room);
    });

    it("rejects a token that belongs to a different room", () => {
      const authorizer = new SessionAuthorizer(
        makeEngine(makeRoom([player]), {
          roomId: ROOM_ID,
          playerId: PLAYER_ID,
        }),
      );

      try {
        authorizer.authorize(SOCKET_ID, token, "OTHER_ROOM");
        expect.unreachable("expected an AuthError");
      } catch (error) {
        expect((error as AuthError).code).toBe(AuthErrorCode.ROOM_MISMATCH);
      }
    });

    it("rejects an unbound socket", () => {
      const authorizer = new SessionAuthorizer(makeEngine(makeRoom([player])));

      try {
        authorizer.authorize(SOCKET_ID, token, ROOM_ID);
        expect.unreachable("expected an AuthError");
      } catch (error) {
        expect((error as AuthError).code).toBe(
          AuthErrorCode.SOCKET_IDENTITY_MISMATCH,
        );
      }
    });

    it("rejects a socket bound to a different identity", () => {
      const authorizer = new SessionAuthorizer(
        makeEngine(makeRoom([player]), { roomId: ROOM_ID, playerId: 999 }),
      );

      expect(() => authorizer.authorize(SOCKET_ID, token, ROOM_ID)).toThrowError(
        AuthError,
      );
    });

    it("rejects when the room no longer exists", () => {
      const authorizer = new SessionAuthorizer(
        makeEngine(undefined, { roomId: ROOM_ID, playerId: PLAYER_ID }),
      );

      try {
        authorizer.authorize(SOCKET_ID, token, ROOM_ID);
        expect.unreachable("expected an AuthError");
      } catch (error) {
        expect((error as AuthError).code).toBe(AuthErrorCode.ROOM_NOT_FOUND);
      }
    });

    it("rejects when the player is no longer in the room", () => {
      const authorizer = new SessionAuthorizer(
        makeEngine(makeRoom([{ ...player, id: 7 }]), {
          roomId: ROOM_ID,
          playerId: PLAYER_ID,
        }),
      );

      try {
        authorizer.authorize(SOCKET_ID, token, ROOM_ID);
        expect.unreachable("expected an AuthError");
      } catch (error) {
        expect((error as AuthError).code).toBe(AuthErrorCode.PLAYER_NOT_FOUND);
      }
    });

    it("does not enforce turn order — that belongs to the engine", () => {
      // The room is on the other player's turn. The authorizer must still
      // resolve the actor; MatchEngine.applyMove owns the turn invariant.
      const room = makeRoom([
        player,
        { id: 7, name: "Bob", position: "F" },
      ]);
      (room as unknown as { currentPlayerIndex: number }).currentPlayerIndex = 1;

      const authorizer = new SessionAuthorizer(
        makeEngine(room, { roomId: ROOM_ID, playerId: PLAYER_ID }),
      );

      expect(authorizer.authorize(SOCKET_ID, token, ROOM_ID).playerId).toBe(
        PLAYER_ID,
      );
    });
  });
});
