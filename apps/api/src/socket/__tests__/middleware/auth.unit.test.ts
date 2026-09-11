import { describe, it, expect, vi } from "vitest";
import { Socket } from "socket.io";
import { MatchEngine } from "../../../services/MatchEngine";
import { issueSessionToken } from "../../../socketAuth";
import {
  requireSession,
  requireRoomAccess,
  requireCurrentTurn,
  composeMiddlewares,
  AuthenticatedSocket,
} from "../../middleware/auth";
import {
  validatePlayerName,
  handleErrorOnSocket,
} from "../../middleware/validation";
import {
  AuthError,
  ValidationError,
  AuthErrorCode,
} from "../../middleware/errors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockSocket(id = "sock-1"): Partial<AuthenticatedSocket> {
  const emitMock = vi.fn();
  return {
    id,
    emit: emitMock,
    to: (() => ({ emit: emitMock })) as any,
    on: vi.fn(),
    handshake: {},
  };
}

function makeMockRepo(overrides: Partial<MatchEngine> = {}): MatchEngine {
  return {
    getSocketBinding: vi.fn(),
    getRoom: vi.fn(),
    ...overrides,
  } as unknown as MatchEngine;
}

// ---------------------------------------------------------------------------
// requireSession
// ---------------------------------------------------------------------------

describe("requireSession", () => {
  it("passes through a valid session token", async () => {
    const secret = "test-secret";
    process.env.SOCKET_SESSION_SECRET = secret;
    const socket = makeMockSocket();
    const token = issueSessionToken("ROOM1", 42);
    const nextFn = vi.fn();

    await requireSession((d) => d.playerToken)(
      socket,
      { playerToken: token },
      nextFn,
    );

    expect(nextFn).toHaveBeenCalledWith();
    expect((socket as AuthenticatedSocket).sessionId).toBeUndefined(); // not attached here
    const authSocket = socket as AuthenticatedSocket;
    expect(authSocket.session?.roomId).toBe("ROOM1");
    expect(authSocket.session?.playerId).toBe(42);
  });

  it("rejects a missing token", async () => {
    const socket = makeMockSocket();
    const nextFn = vi.fn();

    await requireSession((d) => d.playerToken)(socket, {}, nextFn);

    expect(nextFn).toHaveBeenCalledWith(expect.any(AuthError));
    const err = nextFn.mock.calls[0][0] as AuthError;
    expect(err.code).toBe(AuthErrorCode.INVALID_TOKEN);
  });

  it("rejects an invalid token", async () => {
    const socket = makeMockSocket();
    const nextFn = vi.fn();

    await requireSession((d) => d.playerToken)(
      socket,
      { playerToken: "bad-token" },
      nextFn,
    );

    expect(nextFn).toHaveBeenCalledWith(expect.any(AuthError));
  });
});

// ---------------------------------------------------------------------------
// requireRoomAccess
// ---------------------------------------------------------------------------

describe("requireRoomAccess", () => {
  it("passes when socket binding and room match", async () => {
    const roomId = "ROOM1";
    const playerId = 42;
    const player = { id: playerId, name: "Alice" };
    const room = { roomId, players: [player], currentPlayerIndex: 0 };

    const socket = makeMockSocket();
    (socket as AuthenticatedSocket).session = {
      v: 1,
      roomId,
      playerId,
      iat: Math.floor(Date.now() / 1000),
      exp: Date.now() + 1e9,
      nonce: "test",
    };
    (socket as AuthenticatedSocket).playerId = playerId;
    (socket as AuthenticatedSocket).roomId = roomId;

    const nextFn = vi.fn();
    const repo = makeMockRepo({
      getSocketBinding: () => ({ roomId, playerId }),
      getRoom: () => room,
    });

    await requireRoomAccess(repo)(socket, {}, nextFn);

    expect(nextFn).toHaveBeenCalledWith();
    expect((socket as AuthenticatedSocket).room).toBe(room);
    expect((socket as AuthenticatedSocket).player).toBe(player);
  });

  it("rejects when no session exists", async () => {
    const socket = makeMockSocket();
    const nextFn = vi.fn();
    await requireRoomAccess(makeMockRepo())(socket, {}, nextFn);

    expect(nextFn).toHaveBeenCalledWith(expect.any(AuthError));
  });

  it("rejects when socket binding does not match", async () => {
    const roomId = "ROOM1";
    const playerId = 42;
    const socket = makeMockSocket();
    (socket as AuthenticatedSocket).session = {
      v: 1,
      roomId,
      playerId,
      iat: 0,
      exp: Date.now() + 1e9,
      nonce: "n",
    };
    (socket as AuthenticatedSocket).playerId = playerId;
    (socket as AuthenticatedSocket).roomId = roomId;

    const nextFn = vi.fn();
    const repo = makeMockRepo({
      getSocketBinding: () => ({ roomId: "OTHER", playerId: 999 }),
    });

    await requireRoomAccess(repo)(socket, {}, nextFn);

    expect(nextFn).toHaveBeenCalledWith(
      expect.objectContaining({ code: AuthErrorCode.SOCKET_IDENTITY_MISMATCH }),
    );
  });

  it("rejects when room not found", async () => {
    const roomId = "ROOM1";
    const playerId = 42;
    const socket = makeMockSocket();
    (socket as AuthenticatedSocket).session = {
      v: 1,
      roomId,
      playerId,
      iat: 0,
      exp: Date.now() + 1e9,
      nonce: "n",
    };
    (socket as AuthenticatedSocket).playerId = playerId;
    (socket as AuthenticatedSocket).roomId = roomId;

    const nextFn = vi.fn();
    const repo = makeMockRepo({
      getSocketBinding: () => ({ roomId, playerId }),
      getRoom: () => undefined,
    });

    await requireRoomAccess(repo)(socket, {}, nextFn);

    expect(nextFn).toHaveBeenCalledWith(
      expect.objectContaining({ code: AuthErrorCode.ROOM_NOT_FOUND }),
    );
  });

  it("rejects when player not in room", async () => {
    const roomId = "ROOM1";
    const playerId = 42;
    const socket = makeMockSocket();
    (socket as AuthenticatedSocket).session = {
      v: 1,
      roomId,
      playerId,
      iat: 0,
      exp: Date.now() + 1e9,
      nonce: "n",
    };
    (socket as AuthenticatedSocket).playerId = playerId;
    (socket as AuthenticatedSocket).roomId = roomId;

    const nextFn = vi.fn();
    const repo = makeMockRepo({
      getSocketBinding: () => ({ roomId, playerId }),
      getRoom: () => ({ roomId, players: [{ id: 99, name: "Bob" }] }),
    });

    await requireRoomAccess(repo)(socket, {}, nextFn);

    expect(nextFn).toHaveBeenCalledWith(
      expect.objectContaining({ code: AuthErrorCode.PLAYER_NOT_FOUND }),
    );
  });
});

// ---------------------------------------------------------------------------
// requireCurrentTurn
// ---------------------------------------------------------------------------

describe("requireCurrentTurn", () => {
  it("passes when it is the player's turn", async () => {
    const roomId = "ROOM1";
    const playerId = 42;
    const player = { id: playerId, name: "Alice" };
    const room = { roomId, players: [player], currentPlayerIndex: 0 };

    const socket = makeMockSocket();
    (socket as AuthenticatedSocket).room = room;
    (socket as AuthenticatedSocket).player = player;

    const nextFn = vi.fn();
    await requireCurrentTurn(makeMockRepo())(socket, {}, nextFn);

    expect(nextFn).toHaveBeenCalledWith();
  });

  it("rejects when not the player's turn", async () => {
    const roomId = "ROOM1";
    const playerId = 42;
    const player = { id: playerId, name: "Alice" };
    const room = {
      roomId,
      players: [{ id: 42 }, { id: 99 }],
      currentPlayerIndex: 1,
    };

    const socket = makeMockSocket();
    (socket as AuthenticatedSocket).room = room;
    (socket as AuthenticatedSocket).player = player;

    const nextFn = vi.fn();
    await requireCurrentTurn(makeMockRepo())(socket, {}, nextFn);

    expect(nextFn).toHaveBeenCalledWith(
      expect.objectContaining({ code: AuthErrorCode.NOT_YOUR_TURN }),
    );
  });
});

// ---------------------------------------------------------------------------
// composeMiddlewares
// ---------------------------------------------------------------------------

describe("composeMiddlewares", () => {
  it("runs middlewares in sequence and merges results", async () => {
    const m1 = vi.fn((_socket, _data, next) => next(null, { a: 1 }));
    const m2 = vi.fn((_socket, data, next) => {
      expect(data.a).toBe(1);
      next(null, { b: 2 });
    });

    const composed = composeMiddlewares(m1 as any, m2 as any);
    const finalCb = vi.fn();

    await composed(makeMockSocket() as any, {}, finalCb);

    expect(m1).toHaveBeenCalled();
    expect(m2).toHaveBeenCalled();
    expect(finalCb).toHaveBeenCalledWith(null, { b: 2 });
  });

  it("stops on first error", async () => {
    const m1 = vi.fn((_socket, _data, next) => {
      next(new AuthError(AuthErrorCode.INVALID_TOKEN, "fail"));
    });
    const m2 = vi.fn();
    const composed = composeMiddlewares(m1 as any, m2 as any);
    const finalCb = vi.fn();

    await composed(makeMockSocket() as any, {}, finalCb);

    expect(finalCb).toHaveBeenCalledWith(expect.any(AuthError));
    expect(m2).not.toHaveBeenCalled();
  });

  it("handles empty middleware list", async () => {
    const composed = composeMiddlewares();
    const finalCb = vi.fn();
    await composed(makeMockSocket() as any, {}, finalCb);
    expect(finalCb).toHaveBeenCalledWith();
  });
});

// ---------------------------------------------------------------------------
// validatePlayerName
// ---------------------------------------------------------------------------

describe("validatePlayerName", () => {
  it("passes valid names and returns normalizedName", async () => {
    const socket = makeMockSocket();
    const nextFn = vi.fn();

    await validatePlayerName((d) => d.name)(
      socket,
      { name: " Alice " },
      nextFn,
    );

    expect(nextFn).toHaveBeenCalledWith(null, { normalizedName: "Alice" });
    const result = (nextFn.mock.calls[0] as any)[1];
    expect(result.normalizedName).toBe("Alice");
  });

  it("rejects empty names", async () => {
    const socket = makeMockSocket();
    const nextFn = vi.fn();

    await validatePlayerName((d) => d.name)(socket, { name: "" }, nextFn);

    expect(nextFn).toHaveBeenCalledWith(expect.any(ValidationError));
  });

  it("rejects names exceeding max length", async () => {
    const socket = makeMockSocket();
    const nextFn = vi.fn();

    await validatePlayerName((d) => d.name)(
      socket,
      { name: "a".repeat(33) },
      nextFn,
    );

    expect(nextFn).toHaveBeenCalledWith(expect.any(ValidationError));
  });
});

// ---------------------------------------------------------------------------
// handleErrorOnSocket
// ---------------------------------------------------------------------------

describe("handleErrorOnSocket", () => {
  it("emits auth_error for AuthError", () => {
    const socket = makeMockSocket();
    const err = new AuthError(AuthErrorCode.INVALID_TOKEN, "bad token", {
      foo: "bar",
    });
    const result = handleErrorOnSocket(socket as Socket, err);

    expect(result).toBe(true);
    expect((socket as any).emit).toHaveBeenCalledWith(
      "auth_error",
      expect.objectContaining({ code: AuthErrorCode.INVALID_TOKEN }),
    );
  });

  it("emits validation_error for ValidationError", () => {
    const socket = makeMockSocket();
    const err = new ValidationError("BAD_NAME", "not a name");
    const result = handleErrorOnSocket(socket as Socket, err);

    expect(result).toBe(true);
    expect((socket as any).emit).toHaveBeenCalledWith(
      "validation_error",
      expect.objectContaining({ code: "BAD_NAME" }),
    );
  });

  it("emits default event for unknown errors", () => {
    const socket = makeMockSocket();
    handleErrorOnSocket(socket as Socket, new Error("boom"), "game_error");

    expect((socket as any).emit).toHaveBeenCalledWith(
      "game_error",
      "An internal server error occurred.",
    );
  });
});
