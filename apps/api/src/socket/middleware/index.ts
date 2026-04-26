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
  MiddlewareHandler,
  validatePlayerName,
  validateRequiredField,
  handleErrorOnSocket,
} from './validation';

// -- Auth middleware --------------------------------------------------------
export {
  AuthenticatedSocket,
  AuthMiddleware,
  HandlerMiddleware,
  extractHandshakeToken,
  extractTokenFromData,
  authenticateConnection,
  requireSession,
  requireSessionNoBinding,
  requireRoomAccess,
  requireCurrentTurn,
  composeMiddlewares,
} from './auth';
