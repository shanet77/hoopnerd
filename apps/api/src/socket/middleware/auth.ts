import { Socket } from "socket.io";
import { GameRoomRepository } from "../../services/GameRoomRepository";
import { verifySessionToken, SessionTokenClaims } from "../../socketAuth";
import { MiddlewareHandler } from "./validation";
import { AuthError } from "./errors";
import { AuthErrorCode } from "./errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthenticatedSocket extends Socket {
  session?: SessionTokenClaims;
  playerId?: number;
  roomId?: string;
  player?: any; // Player from the room
  room?: any; // GameRoomState
}

export type AuthMiddleware = (
  socket: Socket,
  next: (err?: Error | null) => void,
) => Promise<void>;

/**
 * Handler middleware receives (socket, data, callback).
 */
export type HandlerMiddleware = MiddlewareHandler;

/**
 * Extract session token from handshake headers / query params.
 * Used for connection-level authentication.
 */
export const extractHandshakeToken = (socket: Socket): string | undefined => {
  return (
    socket.handshake.auth?.token ??
    (typeof socket.handshake.query?.token === "string"
      ? socket.handshake.query.token
      : undefined)
  );
};

/**
 * Extract session token from request data.
 * Configurable via a getter function so each handler can specify its field name.
 */
export const extractTokenFromData =
  (field: string) =>
  (data: any): string | undefined => {
    return data?.[field];
  };

// ---------------------------------------------------------------------------
// Connection-level middleware
// ---------------------------------------------------------------------------

/**
 * Verifies the session token provided on connection handshake and attaches
 * claims to the socket.
 */
export const authenticateConnection = (): AuthMiddleware => {
  return async (socket: Socket, next) => {
    try {
      const token = extractHandshakeToken(socket);
      if (token) {
        const claims = verifySessionToken(token);
        if (claims) {
          (socket as AuthenticatedSocket).session = claims;
          (socket as AuthenticatedSocket).playerId = claims.playerId;
          (socket as AuthenticatedSocket).roomId = claims.roomId;
        } else {
          // Token was present but invalid — warn but don't block connection.
          console.warn(
            `Invalid session token on handshake for socket ${socket.id}`,
          );
        }
      }
      next();
    } catch (error) {
      console.error("Error during handshake auth:", error);
      next(error instanceof Error ? error : new Error(String(error)));
    }
  };
};

// ---------------------------------------------------------------------------
// Handler-level middleware
// ---------------------------------------------------------------------------

/**
 * Validates that a session token exists in the request data and is valid.
 * Attaches session / playerId / roomId to the socket.
 */
export function requireSession(
  tokenExtractor: (data: any) => string | undefined,
): HandlerMiddleware {
  return async (socket: Socket, data: any, next) => {
    try {
      const token = tokenExtractor(data);
      if (!token) {
        throw new AuthError(
          AuthErrorCode.INVALID_TOKEN,
          "Session token required",
        );
      }

      const claims = verifySessionToken(token);
      if (!claims) {
        throw new AuthError(
          AuthErrorCode.INVALID_TOKEN,
          "Invalid session token",
        );
      }

      (socket as AuthenticatedSocket).session = claims;
      (socket as AuthenticatedSocket).playerId = claims.playerId;
      (socket as AuthenticatedSocket).roomId = claims.roomId;

      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error(String(error)));
    }
  };
}

/**
 * Validates that:
 *  - a session is established on the socket,
 *  - the socket binding matches the claimed identity,
 *  - the room exists and is active,
 *  - the player is actually in the room.
 */
export function requireRoomAccess(
  roomRepository: GameRoomRepository,
): HandlerMiddleware {
  return async (socket: Socket, data: any, next) => {
    try {
      const authSocket = socket as AuthenticatedSocket;

      if (
        !authSocket.session ||
        !authSocket.roomId ||
        authSocket.playerId === undefined
      ) {
        throw new AuthError(AuthErrorCode.INVALID_TOKEN, "Session required");
      }

      // Validate socket binding identity
      const socketBinding = roomRepository.getSocketBinding(socket.id);
      if (
        !socketBinding ||
        socketBinding.roomId !== authSocket.roomId ||
        socketBinding.playerId !== authSocket.playerId
      ) {
        throw new AuthError(
          AuthErrorCode.SOCKET_IDENTITY_MISMATCH,
          "Socket identity does not match session",
        );
      }

      // Get room state
      const room = roomRepository.getRoom(authSocket.roomId);
      if (!room) {
        throw new AuthError(AuthErrorCode.ROOM_NOT_FOUND, "Room not found");
      }

      // Player existence check
      const player = room.players.find(
        (p: any) => p.id === authSocket.playerId,
      );
      if (!player) {
        throw new AuthError(
          AuthErrorCode.PLAYER_NOT_FOUND,
          "Player is not part of this room",
        );
      }

      authSocket.room = room;
      authSocket.player = player;

      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error(String(error)));
    }
  };
}

/**
 * Validates that the authenticated player's turn it currently.
 */
export function requireCurrentTurn(
  _roomRepository: GameRoomRepository,
): HandlerMiddleware {
  return async (socket: Socket, data: any, next) => {
    try {
      const authSocket = socket as AuthenticatedSocket;

      if (!authSocket.room || !authSocket.player) {
        throw new AuthError(
          AuthErrorCode.INVALID_TOKEN,
          "Active session required",
        );
      }

      // Room state was already fetched and attached by requireRoomAccess
      const room = authSocket.room;
      const currentPlayer = room.players[room.currentPlayerIndex];

      if (!currentPlayer || currentPlayer.id !== authSocket.player.id) {
        throw new AuthError(AuthErrorCode.NOT_YOUR_TURN, "Not your turn", {
          currentPlayerName: currentPlayer?.name,
        });
      }

      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error(String(error)));
    }
  };
}

/**
 * Compose multiple handler middlewares into a single pipeline.
 * Each middleware can attach data to the result object which is passed downstream.
 */
export function composeMiddlewares(
  ...middlewares: HandlerMiddleware[]
): HandlerMiddleware {
  return async (socket: Socket, data: any, finalCallback) => {
    let middlewareIndex = 0;

    const next = (error?: Error | null, result?: any) => {
      if (error) {
        finalCallback(error);
        return;
      }

      middlewareIndex++;
      if (middlewareIndex < middlewares.length) {
        // Merge accumulated result data into data for the next handler
        const mergedData = result ? { ...data, ...result } : data;
        middlewares[middlewareIndex](socket, mergedData, next);
      } else {
        finalCallback(null, result);
      }
    };

    if (middlewares.length > 0) {
      middlewares[0](socket, data, next);
    } else {
      finalCallback();
    }
  };
}
