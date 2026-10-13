"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Bot,
  Brain,
  CircleX,
  Clock,
  Hourglass,
  Target,
  Users,
} from "lucide-react";
import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { FeedbackBanner } from "@repo/ui/feedback-banner";
import type { GameRoomState, Player } from "@repo/types";
import { GameStatusBanner } from "./GameStatusBanner";
import { MoveHistory } from "./MoveHistory";
import { PlayerGraph } from "./PlayerGraph";
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

/**
 * The shared in-game board: turn banner, feedback, chain graph, roster,
 * move form, waiting states and move history.
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

  return (
    <>
      {statusSlot ?? (
        <GameStatusBanner
          roomState={roomState}
          activePlayer={activePlayer}
          isMyTurn={isMyTurn}
          timeRemaining={timeRemaining}
        />
      )}

      {isErrorMessage ? (
        <FeedbackBanner variant="error" icon={<CircleX className="h-5 w-5" />}>
          {gameMessage}
        </FeedbackBanner>
      ) : null}

      {isInfoMessage ? (
        <FeedbackBanner variant="info">{gameMessage}</FeedbackBanner>
      ) : null}

      <Card>
        <CardContent className="py-4">
          <h2 className="font-title text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">
            Player Chain
          </h2>
          {chainSubtitle ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
              {chainSubtitle}
            </p>
          ) : null}
          {roomState.gameStarted && roomState.startingPlayer ? (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border-2 border-gray-100 dark:border-gray-800">
              <PlayerGraph
                startingPlayer={roomState.startingPlayer}
                connections={roomState.connections}
              />
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Hourglass
                className="block h-8 w-8 mx-auto mb-2"
                aria-hidden="true"
              />
              Waiting for the game to start...
            </div>
          )}
        </CardContent>
      </Card>

      {showPlayerList ? (
        <PlayerList players={roomState.players} activePlayer={activePlayer} />
      ) : null}

      {isMyTurn && roomState.gameStarted && (
        <Card className="border-success/30">
          <CardContent className="py-4">
            <div className="flex items-center gap-3 rounded-xl bg-success/10 border border-success/20 px-4 py-3 mb-4">
              <span className="grid place-items-center h-9 w-9 rounded-lg bg-success text-white shrink-0">
                <Target className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="font-title text-xl font-bold text-gray-800 dark:text-gray-100">
                Make Your Move
              </h2>
            </div>
            {showMovePrompt ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                Connect a player to{" "}
                <strong>
                  {roomState.lastConnectedPlayer?.name ||
                    roomState.startingPlayer?.name}
                </strong>{" "}
                who shared a team{describeSeasonWindow(roomState)}.
              </p>
            ) : null}
            <form onSubmit={onSubmit} className="space-y-4">
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
          </CardContent>
        </Card>
      )}

      {!isMyTurn && roomState.gameStarted && (
        <Card
          className={`${
            cpuThinking
              ? "bg-brand-50 dark:bg-brand-900/40 border-brand-200"
              : "bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600"
          }`}
        >
          <CardContent className="py-6 text-center">
            <div
              className={`flex justify-center mb-2 ${
                cpuThinking ? "animate-pulse" : ""
              }`}
            >
              {cpuThinking ? (
                <Brain
                  className="h-8 w-8 text-brand-600 dark:text-brand-300"
                  aria-hidden="true"
                />
              ) : (
                <Clock
                  className="h-8 w-8 text-gray-400 dark:text-gray-500"
                  aria-hidden="true"
                />
              )}
            </div>
            <p className="font-bold text-gray-600 dark:text-gray-300">
              {cpuThinking ? (
                <span className="inline-flex items-center gap-1.5">
                  <Bot className="h-4 w-4" aria-hidden="true" />
                  CPU is thinking...
                </span>
              ) : (
                `Waiting for ${activePlayer?.name}'s move...`
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {!roomState.gameStarted && !isCpuOpponent && (
        <Card className="bg-warning-light/30 dark:bg-warning-dark/20 border-warning/30">
          <CardContent className="py-6 text-center">
            <Users
              className="h-8 w-8 mx-auto mb-2 text-warning-dark dark:text-warning-light"
              aria-hidden="true"
            />
            <p className="font-bold text-warning-dark dark:text-warning-light">
              Waiting for more players...
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Share the code to invite players.
            </p>
          </CardContent>
        </Card>
      )}

      <MoveHistory moves={roomState.moves} />
    </>
  );
}
