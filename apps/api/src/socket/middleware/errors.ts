/**
 * Standardized error codes for socket authentication and validation.
 */
export enum AuthErrorCode {
  INVALID_TOKEN = 'AUTH_001',
  SESSION_EXPIRED = 'AUTH_002',
  ROOM_MISMATCH = 'AUTH_003',
  SOCKET_IDENTITY_MISMATCH = 'AUTH_004',
  PLAYER_NOT_FOUND = 'AUTH_005',
  ROOM_NOT_FOUND = 'AUTH_006',
  NOT_YOUR_TURN = 'AUTH_007',
}

/**
 * Standard error emitted for game-level errors (non-auth).
 */
export enum GameErrorCode {
  GAME_INACTIVE = 'GAME_001',
  NOT_INITIALIZED = 'GAME_002',
  ALREADY_USED = 'GAME_003',
  INVALID_CONNECTION = 'GAME_004',
  DB_ERROR = 'GAME_005',
}

/**
 * Standardized authentication/validation error.
 */
export class AuthError extends Error {
  constructor(
    public code: AuthErrorCode | string,
    public message: string,
    public metadata?: Record<string, any>
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Standardized input validation error.
 */
export class ValidationError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Checks if an error is an AuthError instance.
 */
export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

/**
 * Converts any caught error into a standard error object for client responses.
 */
export function normalizeSocketError(error: unknown): { code: string; message: string } {
  if (error instanceof AuthError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof ValidationError) {
    return { code: error.code, message: error.message };
  }
  return { code: 'INTERNAL_ERROR', message: 'An internal server error occurred.' };
}
