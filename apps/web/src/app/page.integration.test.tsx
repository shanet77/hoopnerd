import "@testing-library/jest-dom";
import React from "react";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Web from "./page";

const pushMock = jest.fn();
const trackEventMock = jest.fn();
const setPlayerSessionMock = jest.fn();
const createRoomMock = jest.fn();
const joinMatchmakingMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("./lib/analytics", () => ({
  trackEvent: (...args: any[]) => trackEventMock(...args),
}));

jest.mock("./lib/playerSession", () => ({
  getPlayerName: () => "",
  setPlayerName: jest.fn(),
  setPlayerSession: (...args: any[]) => setPlayerSessionMock(...args),
}));

jest.mock("./lib/socket", () => ({
  SocketProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSocket: () => ({ socket: {}, isConnected: true }),
  createRoom: (...args: any[]) => createRoomMock(...args),
  joinMatchmaking: (...args: any[]) => joinMatchmakingMock(...args),
  createCpuGame: jest.fn(),
}));

jest.mock("./lib/useAvailableSeasons", () => ({
  useAvailableSeasons: () => ({
    seasons: [],
    minYear: 1950,
    maxYear: 2026,
    loading: false,
  }),
}));

describe("Lobby page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn().mockResolvedValue({
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
    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: "Tim" },
    });
    fireEvent.click(screen.getByRole("button", { name: /find match/i }));

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
});
