// -- Errors -----------------------------------------------------------------
export {
  AuthErrorCode,
  GameErrorCode,
  AuthError,
  ValidationError,
  isAuthError,
  normalizeSocketError,
} from './errors';

// -- Validation helpers -----------------------------------------------------
export {
  validatePlayerName,
  validateRequiredField,
  handleErrorOnSocket,
} from './validation';
export type { MiddlewareHandler } from './validation';

// -- Auth middleware --------------------------------------------------------
export {
  extractHandshakeToken,
  extractTokenFromData,
  authenticateConnection,
  requireSession,
  requireRoomAccess,
  requireCurrentTurn,
  composeMiddlewares,
} from './auth';
export type {
  AuthenticatedSocket,
  AuthMiddleware,
  HandlerMiddleware,
} from './auth';
