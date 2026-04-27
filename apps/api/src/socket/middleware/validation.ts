import { Socket } from 'socket.io';
import { ValidationError, isAuthError } from './errors';
import { normalizePlayerName, MAX_PLAYER_NAME_LENGTH } from '../../socketAuth';

/**
 * Base interface that all middleware handlers must conform to.
 */
export type MiddlewareHandler = (
  socket: Socket,
  data: any,
  next: (err?: Error | null, result?: any) => void
) => Promise<void>;

/**
 * Validates and normalizes a player name from the request data.
 * Returns { normalizedName } on success so downstream handlers can access it.
 */
export function validatePlayerName(
  nameExtractor: (data: any) => string
): MiddlewareHandler {
  return async (socket: Socket, data: any, next) => {
    try {
      const rawName = nameExtractor(data);
      const normalized = normalizePlayerName(rawName ?? '');

      if (!normalized || normalized.length > MAX_PLAYER_NAME_LENGTH) {
        throw new ValidationError(
          'INVALID_NAME',
          `Name is required and must be ${MAX_PLAYER_NAME_LENGTH} characters or fewer.`
        );
      }

      next(null, { normalizedName: normalized });
    } catch (error) {
      next(error instanceof Error ? error : new Error(String(error)));
    }
  };
}

/**
 * Validates that a string value exists in the request data.
 */
export function validateRequiredField(
  fieldExtractor: (data: any) => any,
  fieldName: string
): MiddlewareHandler {
  return async (socket: Socket, data: any, next) => {
    const value = fieldExtractor(data);
    if (value === undefined || value === null || value === '') {
      throw new ValidationError(
        'MISSING_FIELD',
        `${fieldName} is required.`
      );
    }
    next(null, { [fieldName]: value });
  };
}

/**
 * Handler-specific error emission options.
 */
export interface HandleErrorOnSocketOptions {
  /** Fallback event name for legacy clients */
  defaultEvent?: string;
  /** For auth errors: also emit the plain message on this channel (default: same as defaultEvent) */
  legacyChannel?: string;
}

/**
 * Emits the appropriate error event on the socket based on error type.
 * Also emits a backward-compatible message on a legacy channel for non-auth errors.
 * Returns true if an error was emitted (caller should bail).
 */
export function handleErrorOnSocket(
  socket: Socket,
  error: unknown,
  defaultEventOrOptions?: string | HandleErrorOnSocketOptions
): boolean {
  let defaultEvent = 'game_error';
  let legacyChannel = 'game_error';

  if (typeof defaultEventOrOptions === 'string') {
    defaultEvent = defaultEventOrOptions;
  } else if (defaultEventOrOptions) {
    defaultEvent = defaultEventOrOptions.defaultEvent ?? 'game_error';
    legacyChannel = defaultEventOrOptions.legacyChannel ?? defaultEvent;
  }

  if (isAuthError(error)) {
    socket.emit('auth_error', {
      code: error.code,
      message: error.message,
      metadata: error.metadata,
    });
    return true;
  }

  if (error instanceof ValidationError) {
    socket.emit('validation_error', {
      code: error.code,
      message: error.message,
    });
    return true;
  }

  // Legacy string-style error
  socket.emit(legacyChannel, typeof error === 'string' ? error : 'An internal server error occurred.');
  console.error('Unhandled socket error:', error);
  return true;
}
