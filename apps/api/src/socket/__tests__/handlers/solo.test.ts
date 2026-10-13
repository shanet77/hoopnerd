import { describe, expect, it, beforeEach, vi } from "vitest";
import { Socket } from "socket.io";
import { registerSoloGameHandlers } from "../../handlers/solo";
import type { SoloEngine } from "../../../services/SoloEngine";

vi.mock("../../../socketAuth", () => ({
  issueSoloToken: vi.fn(() => "mock-solo-token"),
  verifySoloToken: vi.fn(() => null),
  normalizePlayerName: vi.fn((name: string) => name.trim()),
  MAX_PLAYER_NAME_LENGTH: 32,
}));

import { verifySoloToken } from "../../../socketAuth";

describe("Solo handlers", () => {
  let mockSocket: Partial<Socket>;
  let emitMock: vi.Mock;
  let joinMock: vi.Mock;
  let handlers: Record<string, Function> = {};
  let mockEngine: Partial<SoloEngine>;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = {};
    emitMock = vi.fn();
    joinMock = vi.fn();

    mockSocket = {
      id: "socket-123",
      emit: emitMock,
      join: joinMock,
      on: vi.fn((event: string, handler: Function) => {
        handlers[event] = handler;
      }) as any,
    };

    mockEngine = {
      create: vi.fn(),
      resumeRun: vi.fn(),
      submitMove: vi.fn(),
      endRun: vi.fn(),
    };

    (verifySoloToken as unknown as vi.Mock).mockReturnValue({
      v: 1,
      runId: "RUN123",
      userId: "user-1234",
      iat: 1,
      exp: 9999999999,
      nonce: "n",
    });

    registerSoloGameHandlers(mockSocket as Socket, mockEngine as SoloEngine);
  });

  it("rejects create with an invalid display name", async () => {
    await handlers["create_solo_run"]({
      userId: "user-1234",
      displayName: "  ",
    });

    expect(mockEngine.create).not.toHaveBeenCalled();
    const failure = emitMock.mock.calls.find(
      ([event, payload]: [string, { success: boolean }]) =>
        event === "solo_run_created" && payload.success === false,
    );
    expect(failure).toBeDefined();
  });

  it("rejects create with an invalid user id", async () => {
    await handlers["create_solo_run"]({ userId: "x", displayName: "Shane" });

    expect(mockEngine.create).not.toHaveBeenCalled();
    const failure = emitMock.mock.calls.find(
      ([event, payload]: [string, { success: boolean }]) =>
        event === "solo_run_created" && payload.success === false,
    );
    expect(failure).toBeDefined();
    expect(String(failure![1].message)).toMatch(/user id/i);
  });

  it("creates a run, joins the room, and returns a token", async () => {
    const runState = { roomId: "RUN123", moves: [], gameCompleted: false };
    (mockEngine.create as vi.Mock).mockResolvedValue(runState);

    await handlers["create_solo_run"]({
      userId: "user-1234",
      displayName: "Shane",
    });

    expect(mockEngine.create).toHaveBeenCalledWith(
      "user-1234",
      "Shane",
      undefined,
      undefined,
    );
    expect(joinMock).toHaveBeenCalledWith("RUN123");
    expect(emitMock).toHaveBeenCalledWith("solo_run_created", {
      success: true,
      message: "Solo run created!",
      runState,
      runToken: "mock-solo-token",
    });
  });

  it("reports failure when no starter is available", async () => {
    (mockEngine.create as vi.Mock).mockResolvedValue(null);

    await handlers["create_solo_run"]({
      userId: "user-1234",
      displayName: "Shane",
    });

    const failure = emitMock.mock.calls.find(
      ([event, payload]: [string, { success: boolean }]) =>
        event === "solo_run_created" && payload.success === false,
    );
    expect(failure).toBeDefined();
  });

  it("resumes a stored run", async () => {
    const runState = { roomId: "RUN123", moves: [], gameCompleted: false };
    (mockEngine.resumeRun as vi.Mock).mockReturnValue(runState);

    await handlers["resume_solo_run"]({
      runId: "RUN123",
      runToken: "token",
    });

    expect(mockEngine.resumeRun).toHaveBeenCalledWith("RUN123");
    expect(joinMock).toHaveBeenCalledWith("RUN123");
    expect(emitMock).toHaveBeenCalledWith("solo_run_resumed", {
      success: true,
      message: "Run resumed!",
      runState,
    });
  });

  it("reports expired runs on resume", async () => {
    (mockEngine.resumeRun as vi.Mock).mockReturnValue(undefined);

    await handlers["resume_solo_run"]({
      runId: "RUN123",
      runToken: "token",
    });

    const failure = emitMock.mock.calls.find(
      ([event, payload]: [string, { success: boolean }]) =>
        event === "solo_run_resumed" && payload.success === false,
    );
    expect(failure).toBeDefined();
    expect(String(failure![1].message)).toMatch(/expired/i);
  });

  it("rejects a run-token mismatch on move submit", async () => {
    await handlers["submit_solo_move"]({
      runId: "OTHER1",
      runToken: "token",
      connectedPlayer: { id: 2, name: "Tony Parker", position: "PG" },
    });

    expect(mockEngine.submitMove).not.toHaveBeenCalled();
    expect(emitMock).toHaveBeenCalledWith(
      "auth_error",
      expect.objectContaining({ code: "AUTH_003" }),
    );
  });

  it("forwards move outcomes from the engine", async () => {
    const outcome = { success: true, message: "Connected!", streak: 1 };
    (mockEngine.submitMove as vi.Mock).mockResolvedValue(outcome);

    await handlers["submit_solo_move"]({
      runId: "RUN123",
      runToken: "token",
      connectedPlayer: { id: 2, name: "Tony Parker", position: "PG" },
    });

    expect(mockEngine.submitMove).toHaveBeenCalledWith(
      "RUN123",
      "user-1234",
      expect.objectContaining({ id: 2 }),
    );
    expect(emitMock).toHaveBeenCalledWith("solo_move_result", outcome);
  });

  it("forwards end outcomes from the engine", async () => {
    const outcome = { success: true, message: "Banked!", streak: 3 };
    (mockEngine.endRun as vi.Mock).mockResolvedValue(outcome);

    await handlers["end_solo_run"]({ runId: "RUN123", runToken: "token" });

    expect(mockEngine.endRun).toHaveBeenCalledWith("RUN123", "user-1234");
    expect(emitMock).toHaveBeenCalledWith("solo_run_ended", outcome);
  });
});
