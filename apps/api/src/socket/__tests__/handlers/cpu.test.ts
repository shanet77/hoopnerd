import { describe, expect, it, beforeEach, vi } from "vitest";
import { Socket } from "socket.io";
import { registerCpuGameHandlers } from "../../handlers/cpu";
import { GameRoomRepository } from "../../../services/GameRoomRepository";
import { CpuGameService } from "../../../services/CpuGameService";

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
  let mockRoomRepository: Partial<GameRoomRepository>;
  let mockCpuGameService: Partial<CpuGameService>;

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

    mockRoomRepository = {
      bindSocket: vi.fn(),
      startGame: vi.fn(),
    };

    mockCpuGameService = {
      createCpuGame: vi.fn(),
    };

    registerCpuGameHandlers(
      mockSocket as Socket,
      mockRoomRepository as GameRoomRepository,
      mockCpuGameService as CpuGameService,
    );
  });

  it("resolves cpu_game_created with failure on invalid name", async () => {
    await handlers["create_cpu_game"]({ playerName: "   " });

    expect(mockCpuGameService.createCpuGame).not.toHaveBeenCalled();
    const failure = emitMock.mock.calls.find(
      ([event, payload]: [string, { success: boolean }]) =>
        event === "cpu_game_created" && payload.success === false,
    );
    expect(failure).toBeDefined();
    expect(String(failure![1].message)).toMatch(/required|characters/i);
  });

  it("emits a failure message when the game fails to start", async () => {
    (mockCpuGameService.createCpuGame as vi.Mock).mockReturnValue({
      room: { roomId: "ABC123" },
      humanPlayer: { id: 42, name: "Shane" },
    });
    (mockRoomRepository.startGame as vi.Mock).mockResolvedValue(false);

    await handlers["create_cpu_game"]({ playerName: "Shane" });

    expect(mockRoomRepository.startGame).toHaveBeenCalled();
    expect(mockSocket.emit).toHaveBeenCalledWith("cpu_game_created", {
      success: false,
      message: "Failed to start CPU game.",
    });
  });
});
