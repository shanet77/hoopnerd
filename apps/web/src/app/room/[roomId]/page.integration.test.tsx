import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { GameRoomState, Player } from "@repo/types";
import Room from "./page";

const { useSocketMock, useGameRoomMock } = vi.hoisted(() => ({
  useSocketMock: vi.fn(),
  useGameRoomMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ roomId: "ROOM1" }),
  useSearchParams: () => ({
    get: (key: string) => {
      if (key === "playerName") return "Tim";
      return null;
    },
  }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("../../lib/socket", () => ({
  SocketProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useSocket: () => useSocketMock(),
  joinRoom: vi.fn(),
  submitMove: vi.fn(),
  leaveRoom: vi.fn(),
}));

vi.mock("../../lib/useGameRoom", () => ({
  useGameRoom: () => useGameRoomMock(),
}));

vi.mock("../../../components/ClientOnly", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// PlayerGraph reads the resolved theme to pick its canvas colors.
vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "light",
    resolvedTheme: "light",
    setTheme: vi.fn(),
  }),
}));

const human: Player = { id: 1, name: "Tim", position: "G" };
const bronBot: Player = { id: 2, name: "BronBot", position: "C", isCpu: true };

function makeRoomState(overrides: Partial<GameRoomState> = {}): GameRoomState {
  return {
    roomId: "ROOM1",
    players: [human, bronBot],
    moves: [],
    currentPlayerIndex: 0,
    gameStarted: true,
    gameCompleted: false,
    startingPlayer: { id: 99, name: "Michael Jordan", position: "SG" },
    connections: [],
    friendsOnly: false,
    seasonYearMin: 2019,
    seasonYearMax: 2024,
    ...overrides,
  };
}

function roomHook(overrides: Record<string, unknown> = {}) {
  return {
    activePlayer: human,
    timeRemaining: 25,
    winner: null,
    winReason: "",
    roomState: makeRoomState(),
    gameMessage: "",
    isConnected: true,
    playerToken: "token",
    myPlayerId: 1,
    isMyTurn: true,
    isCpuOpponent: true,
    cpuThinking: false,
    handleSubmitMove: vi
      .fn()
      .mockResolvedValue({ success: true, message: "Move submitted" }),
    handleLeaveRoom: vi.fn(),
    setGameMessage: vi.fn(),
    ...overrides,
  };
}

function mountRoom() {
  useSocketMock.mockReturnValue({ socket: {}, isConnected: true });
  useGameRoomMock.mockReturnValue(roomHook());
}

describe("Room page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows connecting state before socket is available", () => {
    useSocketMock.mockReturnValue({ socket: null, isConnected: false });
    useGameRoomMock.mockReturnValue(roomHook());
    render(<Room />);
    expect(screen.getByText(/connecting/i)).toBeInTheDocument();
    expect(screen.getByText(/preparing your session/i)).toBeInTheDocument();
  });

  it("shows the joining state until roomState arrives", () => {
    useSocketMock.mockReturnValue({ socket: {}, isConnected: true });
    useGameRoomMock.mockReturnValue(roomHook({ roomState: null }));
    render(<Room />);
    expect(screen.getByText(/joining room/i)).toBeInTheDocument();
    expect(screen.getByText(/loading room details/i)).toBeInTheDocument();
  });
});
describe("Room page game board", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mountRoom();
  });

  it("renders the turn banner, chain, roster and move form", () => {
    render(<Room />);

    expect(screen.getByText("Current Turn")).toBeInTheDocument();
    expect(screen.getByText("Player Chain")).toBeInTheDocument();
    expect(screen.getByText("Players in Room")).toBeInTheDocument();
    expect(screen.getByText("Make Your Move")).toBeInTheDocument();
    expect(screen.getByText("Tim")).toBeInTheDocument();
    expect(screen.getByText("BronBot")).toBeInTheDocument();
    expect(screen.getByText("Your turn")).toBeInTheDocument();
  });

  it("states the season window in the move prompt", () => {
    render(<Room />);
    expect(
      screen.getByText(/who shared a team during the 2019–2024 seasons/),
    ).toBeInTheDocument();
  });

  it("disables submission until a player is selected", () => {
    render(<Room />);
    expect(
      screen.getByRole("button", { name: /select a player/i }),
    ).toBeDisabled();
  });

  it("surfaces rejected moves as an alert", () => {
    useGameRoomMock.mockReturnValue(
      roomHook({ gameMessage: "Invalid connection" }),
    );
    render(<Room />);
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid connection");
  });

  it("surfaces turn messages as a status", () => {
    useGameRoomMock.mockReturnValue(
      roomHook({ gameMessage: "It is your turn" }),
    );
    render(<Room />);
    // Rendered twice: once in the screen-reader live region at the top of
    // the page, once in the visible info FeedbackBanner.
    expect(screen.getAllByText("It is your turn")).toHaveLength(2);
  });

  it("waits on the opponent when it is not my turn", () => {
    useGameRoomMock.mockReturnValue(
      roomHook({ isMyTurn: false, activePlayer: bronBot }),
    );
    render(<Room />);
    expect(screen.getByText("Waiting for BronBot's move...")).toBeInTheDocument();
    expect(screen.queryByText("Make Your Move")).not.toBeInTheDocument();
  });

  it("shows the CPU thinking state", () => {
    useGameRoomMock.mockReturnValue(
      roomHook({ isMyTurn: false, activePlayer: bronBot, cpuThinking: true }),
    );
    render(<Room />);
    expect(screen.getByText(/cpu is thinking/i)).toBeInTheDocument();
  });

  it("invites more players while a multiplayer room has not started", () => {
    useGameRoomMock.mockReturnValue(
      roomHook({
        isCpuOpponent: false,
        roomState: makeRoomState({ gameStarted: false }),
      }),
    );
    render(<Room />);
    expect(screen.getByText(/waiting for more players/i)).toBeInTheDocument();
    expect(
      screen.getByText(/share the code to invite players/i),
    ).toBeInTheDocument();
  });

  it("renders move history once moves exist", () => {
    useGameRoomMock.mockReturnValue(
      roomHook({
        roomState: makeRoomState({
          moves: [{ playerId: 1, playerName: "Tim", position: "SG" }],
        }),
      }),
    );
    render(<Room />);
    expect(screen.getByText("Move History")).toBeInTheDocument();
  });

  it("celebrates the winner", () => {
    useGameRoomMock.mockReturnValue(
      roomHook({ winner: bronBot, winReason: "Longest chain" }),
    );
    render(<Room />);
    expect(screen.getByText("BronBot Wins!")).toBeInTheDocument();
    expect(screen.getByText("Longest chain")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /back to lobby/i }),
    ).toBeInTheDocument();
  });

  it("exposes the room shell with a copyable code", () => {
    render(<Room />);
    expect(
      screen.getByRole("button", { name: /leave room and return to lobby/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: /room code room1/i }),
    ).toHaveTextContent("ROOM1");
  });
});


