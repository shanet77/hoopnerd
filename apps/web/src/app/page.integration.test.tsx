import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Web from "./page";

const {
  pushMock,
  trackEventMock,
  setPlayerSessionMock,
  createRoomMock,
  joinMatchmakingMock,
  createCpuGameMock,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  trackEventMock: vi.fn(),
  setPlayerSessionMock: vi.fn(),
  createRoomMock: vi.fn(),
  joinMatchmakingMock: vi.fn(),
  createCpuGameMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("./lib/analytics", () => ({
  trackEvent: (...args: any[]) => trackEventMock(...args),
}));

vi.mock("./lib/playerSession", () => ({
  getPlayerName: () => "",
  setPlayerName: vi.fn(),
  setPlayerSession: (...args: any[]) => setPlayerSessionMock(...args),
}));

vi.mock("./lib/socket", () => ({
  SocketProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSocket: () => ({ socket: {}, isConnected: true }),
  createRoom: (...args: any[]) => createRoomMock(...args),
  joinMatchmaking: (...args: any[]) => joinMatchmakingMock(...args),
  createCpuGame: (...args: any[]) => createCpuGameMock(...args),
}));

vi.mock("./lib/useAvailableSeasons", () => ({
  useAvailableSeasons: () => ({
    seasons: [],
    minYear: 1950,
    maxYear: 2026,
    loading: false,
  }),
}));

const mockStatsResponse = () => ({
  ok: true,
  json: async () => ({
    windowDays: 7,
    timezone: "America/New_York",
    updatedAt: "2026-01-01T00:00:00.000Z",
    players: [],
    teams: [],
    seasons: [],
    longestStreak: 0,
  }),
});

async function waitForStats() {
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
}

 describe("Lobby page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).fetch = vi.fn().mockResolvedValue(mockStatsResponse());
  });

  it("shows primary CTAs and a name prompt", async () => {
    render(<Web />);
    await waitForStats();

    expect(screen.getByRole("button", { name: /quick play/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play vs cpu/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();
    expect(screen.getByText(/enter your name to unlock game actions/i)).toBeInTheDocument();
  });

  it("disables primary CTAs until a name is entered", async () => {
    render(<Web />);
    await waitForStats();

    expect(screen.getByRole("button", { name: /quick play/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /play vs cpu/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: "Tim" },
    });

    expect(screen.getByRole("button", { name: /quick play/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /play vs cpu/i })).toBeEnabled();
  });

  it("joins matchmaking and routes to room on success", async () => {
    joinMatchmakingMock.mockResolvedValueOnce({
      success: true,
      message: "ok",
      roomId: "ROOM99",
      joinedExisting: true,
      playerToken: "token",
      playerId: 7,
    });

    render(<Web />);
    await waitForStats();
    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: "Tim" },
    });
    fireEvent.click(screen.getByRole("button", { name: /quick play/i }));

    await waitFor(() => {
      expect(joinMatchmakingMock).toHaveBeenCalled();
      expect(setPlayerSessionMock).toHaveBeenCalledWith("ROOM99", "Tim", {
        token: "token",
        playerId: 7,
      });
      expect(pushMock).toHaveBeenCalledWith("/room/ROOM99?playerName=Tim");
      expect(trackEventMock).toHaveBeenCalled();
    });
  });

  it("starts a CPU game with default All Time season", async () => {
    createCpuGameMock.mockResolvedValueOnce({
      success: true,
      roomId: "CPUROOM",
      playerToken: "cpu-token",
      playerId: 2,
    });

    render(<Web />);
    await waitForStats();
    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: "Tim" },
    });
    fireEvent.click(screen.getByRole("button", { name: /play vs cpu/i }));

    await waitFor(() => {
      expect(createCpuGameMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          playerName: "Tim",
          difficulty: "easy",
          seasonYearMin: undefined,
          seasonYearMax: undefined,
        }),
      );
      expect(setPlayerSessionMock).toHaveBeenCalledWith("CPUROOM", "Tim", {
        token: "cpu-token",
        playerId: 2,
      });
      expect(pushMock).toHaveBeenCalledWith(
        "/room/CPUROOM?playerName=Tim&cpuMode=true&cpuDifficulty=easy",
      );
    });
  });

  it("starts a CPU game with a selected season preset", async () => {
    createCpuGameMock.mockResolvedValueOnce({
      success: true,
      roomId: "CPU90S",
      playerToken: "cpu-token",
      playerId: 2,
    });

    render(<Web />);
    await waitForStats();
    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: "Tim" },
    });
    fireEvent.click(screen.getByRole("button", { name: "90s" }));
    fireEvent.click(screen.getByRole("button", { name: /play vs cpu/i }));

    await waitFor(() => {
      expect(createCpuGameMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          playerName: "Tim",
          difficulty: "easy",
          seasonYearMin: 1990,
          seasonYearMax: 1999,
        }),
      );
      expect(pushMock).toHaveBeenCalledWith(
        expect.stringContaining("seasonYearMin=1990&seasonYearMax=1999"),
      );
    });
  });

  it("creates a friends-only room", async () => {
    createRoomMock.mockResolvedValueOnce({
      success: true,
      roomId: "FRIEND01",
    });

    render(<Web />);
    await waitForStats();
    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: "Tim" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create room/i }));

    await waitFor(() => {
      expect(createRoomMock).toHaveBeenCalledWith(expect.anything(), true);
      expect(pushMock).toHaveBeenCalledWith(
        "/room/FRIEND01?playerName=Tim&friendsOnly=true",
      );
    });
  });

  it("joins a room with a code", async () => {
    render(<Web />);
    await waitForStats();
    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: "Tim" },
    });
    fireEvent.change(screen.getByPlaceholderText(/abc123/i), {
      target: { value: "JOIN12" },
    });
    fireEvent.click(screen.getByRole("button", { name: /join room/i }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/room/JOIN12?playerName=Tim");
    });
  });
});
