import { describe, expect, it, beforeEach, vi } from "vitest";
import { Socket } from "socket.io";
import { registerCpuGameHandlers } from "../../handlers/cpu";
import { MatchEngine } from "../../../services/MatchEngine";

vi.mock("../../../socketAuth", () => ({
  generatePlayerId: vi.fn(() => 42),
  issueSessionToken: vi.fn(() => "mock-token"),
  normalizePlayerName: vi.fn((name: string) => name.trim()),
  MAX_PLAYER_NAME_LENGTH: 32,
}));

describe("CPU handlers", () => {
  let mockSocket: Partial<Socket>;
  let emitMock: vi.Mock;
  let toMock: vi.Mock;
  let joinMock: vi.Mock;
  let handlers: Record<string, Function> = {};
  let mockEngine: Partial<MatchEngine>;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = {};
    emitMock = vi.fn();
    toMock = vi.fn(() => ({ emit: vi.fn() }));
    joinMock = vi.fn();

    mockSocket = {
      id: "socket-123",
      emit: emitMock,
      to: toMock,
      join: joinMock,
      on: vi.fn((event: string, handler: Function) => {
        handlers[event] = handler;
      }) as any,
    };

    mockEngine = {
      createCpuGame: vi.fn(),
      bindSocket: vi.fn(),
      start: vi.fn(),
    };

    registerCpuGameHandlers(mockSocket as Socket, mockEngine as MatchEngine);
  });

  it("resolves cpu_game_created with failure on invalid name", async () => {
    await handlers["create_cpu_game"]({ playerName: "   " });

    expect(mockEngine.createCpuGame).not.toHaveBeenCalled();
    const failure = emitMock.mock.calls.find(
      ([event, payload]: [string, { success: boolean }]) =>
        event === "cpu_game_created" && payload.success === false,
    );
    expect(failure).toBeDefined();
    expect(String(failure![1].message)).toMatch(/required|characters/i);
  });

  it("emits a failure message when the game fails to start", async () => {
    (mockEngine.createCpuGame as vi.Mock).mockReturnValue({
      room: { roomId: "ABC123" },
      humanPlayer: { id: 42, name: "Shane" },
    });
    (mockEngine.start as vi.Mock).mockResolvedValue(false);

    await handlers["create_cpu_game"]({ playerName: "Shane" });

    expect(mockEngine.start).toHaveBeenCalled();
    expect(mockSocket.emit).toHaveBeenCalledWith("cpu_game_created", {
      success: false,
      message: "Failed to start CPU game.",
    });
  });
});
