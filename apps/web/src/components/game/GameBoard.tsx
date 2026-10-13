"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Bot, Brain, CircleX, Hourglass, Users } from "lucide-react";
import { Button } from "@repo/ui/button";
import { FeedbackBanner } from "@repo/ui/feedback-banner";
import type { GameRoomState, Player } from "@repo/types";
import { GameStatusBanner } from "./GameStatusBanner";
import { ChainBoard } from "./ChainBoard";
import { PlayerList } from "./PlayerList";
import { PlayerSearch } from "./PlayerSearch";

/**
 * The season window clause shared by the chain intro and the move prompt.
 * Exported so surfaces can build their own copy without re-deriving it.
 */
export function describeSeasonWindow(roomState: GameRoomState): string {
  const { seasonYearMin, seasonYearMax } = roomState;
  return seasonYearMin !== undefined && seasonYearMax !== undefined
    ? ` during the ${seasonYearMin}\u2013${seasonYearMax} seasons`
    : " in the same season";
}

export interface GameBoardProps {
  roomState: GameRoomState;
  activePlayer: Player | null;
  isMyTurn: boolean;
  timeRemaining: number;
  cpuThinking: boolean;
  gameMessage: string;
  /**
   * True when the opponent is BronBot. A CPU room is always two-player, so
   * the "invite more players" prompt would be misleading there.
   */
  isCpuOpponent: boolean;
  /** Intro copy under the "Player Chain" heading; differs per surface. */
  chainSubtitle?: string;
  /** Submits the drafted move and reports whether it was accepted. */
  onSubmitMove: (player: Player) => Promise<{ success: boolean }>;
  /** Replaces the default turn/timer banner (e.g. solo streak header). */
  statusSlot?: React.ReactNode;
  /** Hides the room roster; solo runs have no room players to list. */
  showPlayerList?: boolean;
  /** Hides the "Make Your Move" prompt line; solo surfaces show their own. */
  showMovePrompt?: boolean;
}

const Section = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <section className={`py-5 ${className}`}>{children}</section>
);

/**
 * The shared in-game board: turn banner, feedback, flat chain tiles, roster,
 * move form, waiting states. Sections are separated by hairline dividers —
 * no cards anywhere.
 *
 * Owns the drafted-connection state so each surface only supplies game data
 * and a submit callback. Route-specific chrome (headers, sockets, game-over
 * screens, embed bridging) stays with the calling page.
 */
export function GameBoard({
  roomState,
  activePlayer,
  isMyTurn,
  timeRemaining,
  cpuThinking,
  gameMessage,
  isCpuOpponent,
  chainSubtitle,
  onSubmitMove,
  statusSlot,
  showPlayerList = true,
  showMovePrompt = true,
}: GameBoardProps) {
  const [connectedPlayer, setConnectedPlayer] = useState<Player | null>(null);
  const apiHost = process.env.NEXT_PUBLIC_API_HOST || "http://localhost:3001";

  const isErrorMessage =
    gameMessage.includes("Invalid") || gameMessage.includes("not play with");
  const isInfoMessage =
    gameMessage !== "" &&
    !gameMessage.includes("Invalid") &&
    (gameMessage.includes("turn") || gameMessage.includes("thinking"));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!connectedPlayer) return;

    const response = await onSubmitMove(connectedPlayer);
    if (response.success) {
      setConnectedPlayer(null);
    }
  };

  const chainStarted = roomState.gameStarted && roomState.startingPlayer;

  return (
    <div className="divide-y divide-gray-200 dark:divide-gray-700">
      <Section className="pb-5">
        {statusSlot ?? (
          <GameStatusBanner
            roomState={roomState}
            activePlayer={activePlayer}
            isMyTurn={isMyTurn}
            timeRemaining={timeRemaining}
          />
        )}
      </Section>

      {isErrorMessage ? (
        <FeedbackBanner variant="error" icon={<CircleX className="h-5 w-5" />}>
          {gameMessage}
        </FeedbackBanner>
      ) : null}

      {isInfoMessage ? (
        <FeedbackBanner variant="info">{gameMessage}</FeedbackBanner>
      ) : null}

      <Section>
        <h2 className="font-title text-xl font-bold text-gray-800 dark:text-gray-100 mb-1">
          Player Chain
        </h2>
        {chainSubtitle ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
            {chainSubtitle}
          </p>
        ) : null}
        {chainStarted ? (
          <ChainBoard
            startingPlayer={roomState.startingPlayer!}
            connections={roomState.connections}
          />
        ) : (
          <div className="flex items-center justify-center gap-2 py-8 text-gray-500 dark:text-gray-400">
            <Hourglass className="h-5 w-5" aria-hidden="true" />
            Waiting for the game to start...
          </div>
        )}
      </Section>

      {showPlayerList ? (
        <Section>
          <PlayerList players={roomState.players} activePlayer={activePlayer} />
        </Section>
      ) : null}

      {isMyTurn && roomState.gameStarted ? (
        <Section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-success-dark dark:text-success-light mb-3">
            Make Your Move
          </h2>
          {showMovePrompt ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
              Connect a player to{" "}
              <strong className="text-gray-800 dark:text-gray-100">
                {roomState.lastConnectedPlayer?.name ||
                  roomState.startingPlayer?.name}
              </strong>{" "}
              who shared a team{describeSeasonWindow(roomState)}.
            </p>
          ) : null}
          <form onSubmit={onSubmit} className="space-y-3">
            <PlayerSearch
              apiHost={apiHost}
              selectedPlayer={connectedPlayer}
              onSelect={setConnectedPlayer}
            />
            <Button
              type="submit"
              disabled={!connectedPlayer}
              variant="success"
              className="w-full text-lg py-4"
            >
              {connectedPlayer ? (
                <span className="inline-flex items-center justify-center gap-2">
                  Submit Move <ArrowRight className="h-5 w-5" />
                </span>
              ) : (
                "Select a Player"
              )}
            </Button>
          </form>
        </Section>
      ) : null}

      {!isMyTurn && roomState.gameStarted ? (
        <Section>
          <div
            className={`px-4 py-4 rounded-md text-center font-bold text-gray-600 dark:text-gray-300 ${
              cpuThinking
                ? "bg-brand-50 dark:bg-brand-900/40"
                : "bg-gray-100 dark:bg-gray-700"
            }`}
          >
            <span className={`inline-flex items-center gap-2 ${cpuThinking ? "animate-pulse" : ""}`}>
              {cpuThinking ? (
                <>
                  <Brain className="h-5 w-5 text-brand-600 dark:text-brand-300" aria-hidden="true" />
                  <Bot className="h-4 w-4" aria-hidden="true" />
                  CPU is thinking...
                </>
              ) : (
                `Waiting for ${activePlayer?.name}'s move...`
              )}
            </span>
          </div>
        </Section>
      ) : null}

      {!roomState.gameStarted && !isCpuOpponent ? (
        <Section>
          <div className="px-4 py-6 rounded-md bg-warning-light/50 dark:bg-warning-dark/20 text-center">
            <Users className="h-6 w-6 mx-auto mb-2 text-warning-dark dark:text-warning-light" aria-hidden="true" />
            <p className="font-bold text-warning-dark dark:text-warning-light">
              Waiting for more players...
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Share the code to invite players.
            </p>
          </div>
        </Section>
      ) : null}
    </div>
  );
}
