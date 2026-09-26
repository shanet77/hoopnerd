import type { Socket } from "socket.io";
import { normalizePlayerName, MAX_PLAYER_NAME_LENGTH } from "../socketAuth";
import { AuthError } from "./SessionAuthorizer";

/**
 * Standardized input validation error.
 */
export class ValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Normalizes a player name or throws. Single call, no callback plumbing.
 */
export function requirePlayerName(raw: unknown): string {
  const normalized = normalizePlayerName(typeof raw === "string" ? raw : "");

  if (!normalized || normalized.length > MAX_PLAYER_NAME_LENGTH) {
    throw new ValidationError(
      "INVALID_NAME",
      `Name is required and must be ${MAX_PLAYER_NAME_LENGTH} characters or fewer.`,
    );
  }

  return normalized;
}

/**
 * Translates a thrown error into the event the client listens for. The single
 * exit point for failures, so handlers never hand-roll error emits.
 */
export function respondWithError(socket: Socket, error: unknown): void {
  if (error instanceof AuthError) {
    socket.emit("auth_error", { code: error.code, message: error.message });
    return;
  }

  if (error instanceof ValidationError) {
    socket.emit("validation_error", {
      code: error.code,
      message: error.message,
    });
    return;
  }

  console.error("Unhandled socket error:", error);
  socket.emit("game_error", "An internal server error occurred.");
}
