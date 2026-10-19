import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { GameRoomState, Player } from "@repo/types";
import EmbedCpuGame from "./page";

const {
  useSocketMock,
  useGameRoomMock,
  createCpuGameMock,
  trackEventMock,
  setPlayerSessionMock,
} = vi.hoisted(() => ({
  useSocketMock: vi.fn(),
  useGameRoomMock: vi.fn(),
  createCpuGameMock: vi.fn(),
  trackEventMock: vi.fn(),
  setPlayerSessionMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === "name" ? "Tim" : null),
  }),
}));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// next-themes is mocked so no theme provider is needed in the test DOM.
vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "light",
    resolvedTheme: "light",
    setTheme: vi.fn(),
  }),
}));

vi.mock("../../lib/socket", () => ({
  SocketProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useSocket: () => useSocketMock(),
  createCpuGame: (...args: unknown[]) => createCpuGameMock(...args),
}));

vi.mock("../../lib/gameRoom/useGameRoom", () => ({
  useGameRoom: () => useGameRoomMock(),
}));

vi.mock("../../lib/useAvailableSeasons", () => ({
  useAvailableSeasons: () => ({
    seasons: [],
    minYear: 1950,
    maxYear: 2026,
    loading: false,
  }),
}));

vi.mock("../../lib/playerSession", () => ({
  getPlayerSession: () => null,
  setPlayerSession: (...args: unknown[]) => setPlayerSessionMock(...args),
  clearPlayerSession: vi.fn(),
}));

vi.mock("../../lib/analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

vi.mock("../../../components/ClientOnly", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const human: Player = { id: 1, name: "Tim", position: "G" };
const bronBot: Player = { id: 2, name: "BronBot", position: "C", isCpu: true };

function makeRoomState(overrides: Partial<GameRoomState> = {}): GameRoomState {
  return {
    roomId: "CPU123",
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

/**
 * Drives the real embed lifecycle: the "starting" phase creates a CPU game,
 * persists the session, then the "playing" phase mounts the board.
 */
async function mountEmbedBoard() {
  useSocketMock.mockReturnValue({ socket: {}, isConnected: true });
  createCpuGameMock.mockResolvedValue({
    success: true,
    roomId: "CPU123",
    playerToken: "token",
    playerId: 1,
  });
  useGameRoomMock.mockReturnValue(roomHook());

  render(<EmbedCpuGame />);
  await waitFor(() => expect(screen.getByText("Player Chain")).toBeInTheDocument());
}

describe("Embed CPU game", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a CPU game then renders the board", async () => {
    await mountEmbedBoard();

    expect(createCpuGameMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ playerName: "Tim", difficulty: "easy" }),
    );
    expect(setPlayerSessionMock).toHaveBeenCalledWith("CPU123", "Tim", {
      token: "token",
      playerId: 1,
    });
  });

  it("shows the retry card when creation fails", async () => {
    useSocketMock.mockReturnValue({ socket: {}, isConnected: true });
    createCpuGameMock.mockResolvedValue({
      success: false,
      message: "No games available.",
    });

    render(<EmbedCpuGame />);

    await waitFor(() =>
      expect(screen.getByText(/couldn't start the game/i)).toBeInTheDocument(),
    );
    expect(screen.getByText("No games available.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
  });
});

describe("Embed CPU game board", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the embed shell around the board", async () => {
    await mountEmbedBoard();

    expect(screen.getByText("HoopNerd vs CPU")).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "HoopNerd" }),
    ).toBeInTheDocument();
    // The visible label is "New game"; the aria-label supplies the
    // accessible name.
    expect(
      screen.getByRole("button", {
        name: /leave this game and start a new one/i,
      }),
    ).toBeInTheDocument();
  });

  it("renders the turn banner, chain, roster and move form", async () => {
    await mountEmbedBoard();

    expect(screen.getByText("Current Turn")).toBeInTheDocument();
    expect(screen.getByText("Player Chain")).toBeInTheDocument();
    expect(screen.getByText("Players in Room")).toBeInTheDocument();
    expect(screen.getByText("Make Your Move")).toBeInTheDocument();
    expect(screen.getByText("Tim")).toBeInTheDocument();
    expect(screen.getByText("BronBot")).toBeInTheDocument();
    expect(screen.getByText("Your turn")).toBeInTheDocument();
  });

  it("constrains the move prompt to the room season range", async () => {
    await mountEmbedBoard();

    const movePrompt = screen.getByText(/connect a player to/i);

    expect(movePrompt).toHaveTextContent("during the 2019–2024 seasons");
  });

  it("disables submission until a player is selected", async () => {
    await mountEmbedBoard();

    expect(
      screen.getByRole("button", { name: /select a player/i }),
    ).toBeDisabled();
  });

  it("surfaces rejected moves as an alert", async () => {
    useSocketMock.mockReturnValue({ socket: {}, isConnected: true });
    createCpuGameMock.mockResolvedValue({
      success: true,
      roomId: "CPU123",
      playerToken: "token",
      playerId: 1,
    });
    useGameRoomMock.mockReturnValue(
      roomHook({ gameMessage: "Invalid connection" }),
    );

    render(<EmbedCpuGame />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid connection"),
    );
  });

  it("waits on the CPU when it is not my turn", async () => {
    useSocketMock.mockReturnValue({ socket: {}, isConnected: true });
    createCpuGameMock.mockResolvedValue({
      success: true,
      roomId: "CPU123",
      playerToken: "token",
      playerId: 1,
    });
    useGameRoomMock.mockReturnValue(
      roomHook({ isMyTurn: false, activePlayer: bronBot }),
    );

    render(<EmbedCpuGame />);

    await waitFor(() =>
      expect(
        screen.getByText("Waiting for BronBot's move..."),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("Make Your Move")).not.toBeInTheDocument();
  });

  it("shows the CPU thinking state", async () => {
    useSocketMock.mockReturnValue({ socket: {}, isConnected: true });
    createCpuGameMock.mockResolvedValue({
      success: true,
      roomId: "CPU123",
      playerToken: "token",
      playerId: 1,
    });
    useGameRoomMock.mockReturnValue(
      roomHook({ isMyTurn: false, activePlayer: bronBot, cpuThinking: true }),
    );

    render(<EmbedCpuGame />);

    await waitFor(() =>
      expect(screen.getByText(/cpu is thinking/i)).toBeInTheDocument(),
    );
  });

  it("renders each move as a chain tile once moves exist", async () => {
    useSocketMock.mockReturnValue({ socket: {}, isConnected: true });
    createCpuGameMock.mockResolvedValue({
      success: true,
      roomId: "CPU123",
      playerToken: "token",
      playerId: 1,
    });
    useGameRoomMock.mockReturnValue(
      roomHook({
        roomState: makeRoomState({
          moves: [{ playerId: 1, playerName: "Tim", position: "SG" }],
          connections: [
            {
              fromPlayer: { id: 99, name: "Michael Jordan", position: "SG" },
              toPlayer: human,
              teamName: "Bulls",
              seasonYear: 1996,
            },
          ],
        }),
      }),
    );

    render(<EmbedCpuGame />);

    await waitFor(() => {
      expect(screen.getAllByText("Tim").length).toBeGreaterThan(0);
      expect(screen.getByText(/Bulls · 1996/i)).toBeInTheDocument();
    });
  });

  it("celebrates the winner with a play-again action", async () => {
    useSocketMock.mockReturnValue({ socket: {}, isConnected: true });
    createCpuGameMock.mockResolvedValue({
      success: true,
      roomId: "CPU123",
      playerToken: "token",
      playerId: 1,
    });
    useGameRoomMock.mockReturnValue(
      roomHook({ winner: bronBot, winReason: "Longest chain" }),
    );

    render(<EmbedCpuGame />);

    await waitFor(() =>
      expect(screen.getByText("BronBot Wins!")).toBeInTheDocument(),
    );
    expect(screen.getByText("Longest chain")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /play again/i }),
    ).toBeInTheDocument();
  });

  it("shows a recovery card when joining the created room fails", async () => {
    useSocketMock.mockReturnValue({ socket: {}, isConnected: true });
    createCpuGameMock.mockResolvedValue({
      success: true,
      roomId: "CPU123",
      playerToken: "token",
      playerId: 1,
    });
    useGameRoomMock.mockReturnValue(
      roomHook({ roomState: null, gameMessage: "Failed to join room" }),
    );

    render(<EmbedCpuGame />);

    await waitFor(() =>
      expect(
        screen.getByText("Couldn't rejoin the game"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /start a new game/i }),
    ).toBeInTheDocument();
  });

  it("keeps showing the joining card while no failure is reported", async () => {
    useSocketMock.mockReturnValue({ socket: {}, isConnected: true });
    createCpuGameMock.mockResolvedValue({
      success: true,
      roomId: "CPU123",
      playerToken: "token",
      playerId: 1,
    });
    useGameRoomMock.mockReturnValue(roomHook({ roomState: null }));

    render(<EmbedCpuGame />);

    await waitFor(() =>
      expect(screen.getByText("Joining your game...")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /start a new game/i }),
    ).not.toBeInTheDocument();
  });
});

