import type { GameRoomState, Player } from "@repo/types";
import type { MatchEngine } from "../services/MatchEngine";
import { verifySessionToken } from "../socketAuth";
import type { SessionTokenClaims } from "../socketAuth";

/**
 * Standardized error codes for socket identity failures.
 */
export enum AuthErrorCode {
  INVALID_TOKEN = "AUTH_001",
  SESSION_EXPIRED = "AUTH_002",
  ROOM_MISMATCH = "AUTH_003",
  SOCKET_IDENTITY_MISMATCH = "AUTH_004",
  PLAYER_NOT_FOUND = "AUTH_005",
  ROOM_NOT_FOUND = "AUTH_006",
}

/**
 * Thrown when a socket cannot be resolved to a trusted actor. Carries the
 * wire code the client sees, so handlers can forward it verbatim.
 */
export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * The verified identity behind a socket event. Handlers consume this instead
 * of casting the socket and reading ad-hoc properties off it.
 */
export interface ActorContext {
  readonly claims: SessionTokenClaims;
  readonly roomId: string;
  readonly playerId: number;
  readonly player: Player;
  readonly room: GameRoomState;
}

/**
 * Single owner of "who is this socket allowed to act as?".
 *
 * Everything the socket layer needs to know about identity lives here: token
 * verification, the socket-to-identity binding, and room/player resolution.
 * Game *state* rules (whose turn it is, whether a move is legal) are not
 * identity concerns and belong to MatchEngine.
 */
export class SessionAuthorizer {
  constructor(private readonly matchEngine: MatchEngine) {}

  /**
   * Verifies a session token without requiring a socket binding.
   *
   * Used by join_room, where a returning client presents a token on a socket
   * that is not bound yet — binding is established as part of re-joining.
   */
  verifyToken(token: string | undefined): SessionTokenClaims {
    if (!token) {
      throw new AuthError(AuthErrorCode.INVALID_TOKEN, "Session token required");
    }

    const claims = verifySessionToken(token);
    if (!claims) {
      throw new AuthError(AuthErrorCode.INVALID_TOKEN, "Invalid session token");
    }

    return claims;
  }

  /**
   * Resolves the actor for an event, or throws an AuthError.
   *
   * Checks, in order: the token is valid, the event targets the room the
   * token claims, this socket is bound to that exact room+player, the room
   * still exists, and the player is still in it.
   */
  authorize(
    socketId: string,
    token: string | undefined,
    eventRoomId: string,
  ): ActorContext {
    const claims = this.verifyToken(token);

    if (claims.roomId !== eventRoomId) {
      throw new AuthError(
        AuthErrorCode.ROOM_MISMATCH,
        "Session does not belong to this room",
      );
    }

    const binding = this.matchEngine.getSocketBinding(socketId);
    if (
      !binding ||
      binding.roomId !== claims.roomId ||
      binding.playerId !== claims.playerId
    ) {
      throw new AuthError(
        AuthErrorCode.SOCKET_IDENTITY_MISMATCH,
        "Socket identity does not match session",
      );
    }

    const room = this.matchEngine.getRoom(claims.roomId);
    if (!room) {
      throw new AuthError(AuthErrorCode.ROOM_NOT_FOUND, "Room not found");
    }

    const player = room.players.find((p) => p.id === claims.playerId);
    if (!player) {
      throw new AuthError(
        AuthErrorCode.PLAYER_NOT_FOUND,
        "Player is not part of this room",
      );
    }

    return { claims, roomId: claims.roomId, playerId: claims.playerId, player, room };
  }
}
