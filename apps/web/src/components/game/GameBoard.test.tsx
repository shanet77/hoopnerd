import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { GameRoomState, Player } from "@repo/types";
import { GameBoard, describeSeasonWindow } from "./GameBoard";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

// PlayerSearch is stubbed so these tests exercise GameBoard's own drafted-move
// state without hitting the search API.
vi.mock("./PlayerSearch", () => ({
  PlayerSearch: ({
    selectedPlayer,
    onSelect,
  }: {
    selectedPlayer: Player | null;
    onSelect: (player: Player) => void;
  }) => (
    <div>
      <span data-testid="draft-name">{selectedPlayer?.name ?? "none"}</span>
      <button
        type="button"
        onClick={() =>
          onSelect({ id: 9, name: "Scottie Pippen", position: "SF" })
        }
      >
        pick-pippen
      </button>
    </div>
  ),
}));

const draftedPlayer: Player = {
  id: 9,
  name: "Scottie Pippen",
  position: "SF",
};

const buildPlayer = (overrides: Partial<Player> = {}): Player => ({
  id: 1,
  name: "Michael Jordan",
  position: "SG",
  ...overrides,
});

const buildRoom = (overrides: Partial<GameRoomState> = {}): GameRoomState => ({
  roomId: "ROOM1",
  players: [],
  moves: [],
  currentPlayerIndex: 0,
  gameStarted: true,
  gameCompleted: false,
  winner: null,
  startingPlayer: { id: 1, name: "Michael Jordan", position: "SG" },
  connections: [],
  lastConnectedPlayer: null,
  friendsOnly: false,
  statsRecorded: false,
  ...overrides,
});

const defaultProps: React.ComponentProps<typeof GameBoard> = {
  roomState: buildRoom(),
  activePlayer: buildPlayer(),
  isMyTurn: true,
  timeRemaining: 30,
  cpuThinking: false,
  gameMessage: "Make your move",
  isCpuOpponent: false,
  chainSubtitle: "Connect players who shared a team.",
  onSubmitMove: vi.fn().mockResolvedValue({ success: true }),
};

const renderBoard = (
  overrides: Partial<React.ComponentProps<typeof GameBoard>> = {},
) => render(<GameBoard {...defaultProps} {...overrides} />);

const submitButton = () =>
  screen.getByRole("button", { name: /submit move|select a player/i });

const moveForm = (container: HTMLElement): HTMLFormElement => {
  const form = container.querySelector("form");
  if (!form) throw new Error("expected the move form to be rendered");
  return form;
};

describe("describeSeasonWindow", () => {
  it("names the room season range when one is configured", () => {
    expect(
      describeSeasonWindow(buildRoom({ seasonYearMin: 1991, seasonYearMax: 1998 })),
    ).toBe(" during the 1991–1998 seasons");
  });

  it("falls back to same-season wording when no range is configured", () => {
    expect(describeSeasonWindow(buildRoom())).toBe(" in the same season");
  });
});

describe("GameBoard drafted move", () => {
  it("submits the player drafted from search", async () => {
    const onSubmitMove = vi.fn().mockResolvedValue({ success: true });
    const { container } = renderBoard({ onSubmitMove });

    expect(submitButton()).toBeDisabled();
    expect(submitButton()).toHaveTextContent("Select a Player");

    fireEvent.click(screen.getByText("pick-pippen"));

    expect(submitButton()).toBeEnabled();
    expect(submitButton()).toHaveTextContent("Submit Move");

    fireEvent.submit(moveForm(container));

    await waitFor(() => expect(onSubmitMove).toHaveBeenCalledTimes(1));
    expect(onSubmitMove).toHaveBeenCalledWith(draftedPlayer);
  });

  it("ignores submit while no player is drafted", () => {
    const onSubmitMove = vi.fn().mockResolvedValue({ success: true });
    const { container } = renderBoard({ onSubmitMove });

    fireEvent.submit(moveForm(container));

    expect(onSubmitMove).not.toHaveBeenCalled();
  });

  it("clears the draft after an accepted move", async () => {
    const onSubmitMove = vi.fn().mockResolvedValue({ success: true });
    const { container } = renderBoard({ onSubmitMove });

    fireEvent.click(screen.getByText("pick-pippen"));
    expect(screen.getByTestId("draft-name")).toHaveTextContent("Scottie Pippen");

    fireEvent.submit(moveForm(container));

    await waitFor(() =>
      expect(screen.getByTestId("draft-name")).toHaveTextContent("none"),
    );
    expect(submitButton()).toBeDisabled();
  });

  it("keeps the draft after a rejected move", async () => {
    const onSubmitMove = vi.fn().mockResolvedValue({ success: false });
    const { container } = renderBoard({ onSubmitMove });

    fireEvent.click(screen.getByText("pick-pippen"));
    fireEvent.submit(moveForm(container));

    await waitFor(() => expect(onSubmitMove).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("draft-name")).toHaveTextContent("Scottie Pippen");
    expect(submitButton()).toBeEnabled();
  });
});

describe("GameBoard waiting states", () => {
  it("announces and highlights the card while the CPU is thinking", () => {
    renderBoard({ isMyTurn: false, cpuThinking: true });

    const callout = screen.getByText("CPU is thinking...");
    expect(callout).toBeInTheDocument();
    expect(callout.closest('div[class*="bg-brand-50"]')).not.toBeNull();
  });

  it("shows whose move it is while waiting on another player", () => {
    renderBoard({
      isMyTurn: false,
      cpuThinking: false,
      activePlayer: buildPlayer({ id: 2, name: "Scottie Pippen" }),
    });

    const callout = screen.getByText("Waiting for Scottie Pippen's move...");
    expect(callout).toBeInTheDocument();
    expect(callout.closest('div[class*="bg-gray-100"]')).not.toBeNull();
  });

  it("invites players to join before a human game starts", () => {
    renderBoard({
      roomState: buildRoom({ gameStarted: false }),
      isMyTurn: false,
      isCpuOpponent: false,
    });

    expect(screen.getByText(/share the code to invite players/i)).toBeInTheDocument();
  });

  it("never invites players to join a CPU game", () => {
    renderBoard({
      roomState: buildRoom({ gameStarted: false }),
      isMyTurn: false,
      isCpuOpponent: true,
    });

    expect(screen.queryByText(/share the code to invite players/i)).toBeNull();
  });
});

describe("GameBoard feedback and copy", () => {
  it("renders an error banner for an invalid move", () => {
    renderBoard({ gameMessage: "Invalid: must have shared a team" });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Invalid: must have shared a team",
    );
  });

  it("renders an info banner for a turn message", () => {
    renderBoard({ gameMessage: "Nice chain, your turn is next" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Nice chain, your turn is next",
    );
  });

  it("constrains the move prompt to the room season range", () => {
    renderBoard({
      roomState: buildRoom({ seasonYearMin: 1991, seasonYearMax: 1998 }),
    });

    expect(
      screen.getByText(/who shared a team during the 1991–1998 seasons/i),
    ).toBeInTheDocument();
  });

  it("uses same-season wording when the room has no range", () => {
    renderBoard();

    expect(
      screen.getByText(/who shared a team in the same season/i),
    ).toBeInTheDocument();
  });

  it("renders the chain heading with the supplied subtitle", () => {
    renderBoard({
      chainSubtitle:
        "Connect players who shared a team during the 1991–1998 seasons.",
    });

    expect(
      screen.getByRole("heading", { name: "Player Chain" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Connect players who shared a team during the 1991–1998 seasons.",
      ),
    ).toBeInTheDocument();
  });

  it("waits for the game to start before drawing the chain", () => {
    renderBoard({ roomState: buildRoom({ gameStarted: false }) });

    expect(
      screen.getByText(/waiting for the game to start/i),
    ).toBeInTheDocument();
  });

  it("draws the chain once the game has started", () => {
    renderBoard();

    expect(screen.queryByText(/waiting for the game to start/i)).toBeNull();
  });
});
