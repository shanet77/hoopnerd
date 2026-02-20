import crypto from 'crypto';
import { GameRoomState } from '@repo/types';

const TOKEN_TTL_SECONDS = 60 * 60 * 12;
const TOKEN_VERSION = 1;
const TOKEN_HEADER = { alg: 'HS256', typ: 'JWT' } as const;
const PLAYER_ID_MAX = (2 ** 48) - 1;

export const MAX_PLAYER_NAME_LENGTH = 32;

export type SessionTokenClaims = {
  v: number;
  roomId: string;
  playerId: number;
  iat: number;
  exp: number;
  nonce: string;
};

const getSessionSecret = () => {
  const configured = process.env.SOCKET_SESSION_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SOCKET_SESSION_SECRET must be set in production.');
  }
  return 'dev-insecure-socket-session-secret';
};

const encodeBase64Url = (raw: string) => Buffer.from(raw).toString('base64url');

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const createSessionToken = (claims: SessionTokenClaims) => {
  const encodedHeader = encodeBase64Url(JSON.stringify(TOKEN_HEADER));
  const encodedPayload = encodeBase64Url(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(signingInput)
    .digest('base64url');
  return `${signingInput}.${signature}`;
};

export const verifySessionToken = (token: string): SessionTokenClaims | null => {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, signature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(signingInput)
    .digest('base64url');

  if (!safeEqual(signature, expectedSignature)) return null;

  try {
    const payloadRaw = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadRaw) as SessionTokenClaims;
    if (
      payload.v !== TOKEN_VERSION
      || typeof payload.roomId !== 'string'
      || typeof payload.playerId !== 'number'
      || typeof payload.iat !== 'number'
      || typeof payload.exp !== 'number'
      || typeof payload.nonce !== 'string'
    ) {
      return null;
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
};

export const issueSessionToken = (roomId: string, playerId: number) => {
  const issuedAt = Math.floor(Date.now() / 1000);
  return createSessionToken({
    v: TOKEN_VERSION,
    roomId,
    playerId,
    iat: issuedAt,
    exp: issuedAt + TOKEN_TTL_SECONDS,
    nonce: crypto.randomUUID(),
  });
};

export const normalizePlayerName = (name: string) => name.trim().replace(/\s+/g, ' ');

export const generatePlayerId = (room: GameRoomState) => {
  const existingIds = new Set(room.players.map(player => player.id));
  let candidate = crypto.randomInt(1, PLAYER_ID_MAX);
  while (existingIds.has(candidate)) {
    candidate = crypto.randomInt(1, PLAYER_ID_MAX);
  }
  return candidate;
};
