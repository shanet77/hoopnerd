"use client";

import { useCallback, useEffect, useRef } from "react";
import { ArrowLeft, Trophy } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Badge } from "@repo/ui/badge";
import { Basketball } from "../icons/Basketball";
import { GameBoard, describeSeasonWindow } from "../game/GameBoard";
import { useSocket } from "../../app/lib/socket";
import { useGameRoom } from "../../app/lib/gameRoom/useGameRoom";
import { trackEvent } from "../../app/lib/analytics";
import {
  buildGameOverPayload,
  postGameOverToParent,
} from "../../app/embed/cpu/embed-protocol";
import { EmbedShell } from "./EmbedShell";

export function EmbedRoom({
  roomId,
  playerName,
  onPlayAgain,
}: {
  roomId: string;
  playerName: string;
  onPlayAgain: () => void;
}) {
  const { socket, isConnected: socketConnected } = useSocket();
  const gameOverSentRef = useRef(false);

  const {
    activePlayer,
    timeRemaining,
    winner,
    winReason,
    roomState,
    gameMessage,
    isConnected,
    isMyTurn,
    myPlayerId,
    cpuThinking,
    handleSubmitMove,
    handleLeaveRoom,
  } = useGameRoom(socket, socketConnected, roomId, playerName);

  const handleNewGame = useCallback(() => {
    handleLeaveRoom();
    onPlayAgain();
  }, [handleLeaveRoom, onPlayAgain]);

  // One-way game-over notification for the framing page (origin-checked there).
  useEffect(() => {
    if (!winner || gameOverSentRef.current) return;
    gameOverSentRef.current = true;
    const moves = roomState?.moves.length ?? 0;
    const humanWon =
      typeof myPlayerId === "number" ? winner.id === myPlayerId : false;
    trackEvent("embed_cpu_game_over", {
      human_won: humanWon,
      move_count: moves,
    });
    postGameOverToParent(
      buildGameOverPayload({
        winnerName: winner.name,
        humanWon,
        moves,
        reason: winReason,
      }),
    );
  }, [winner, winReason, roomState?.moves.length, myPlayerId]);

  const joinFailed =
    !roomState &&
    (gameMessage.startsWith("Failed") ||
      gameMessage.includes("no longer valid"));

  if (!roomState) {
    return (
      <EmbedShell title="HoopNerd vs CPU">
        <div className="text-center py-10 space-y-4">
          <Basketball
            className="h-10 w-10 mx-auto text-basketball animate-spin"
            aria-hidden="true"
          />
          <h2 className="font-title text-xl font-bold text-gray-800 dark:text-gray-100">
            {joinFailed ? "Couldn't rejoin the game" : "Joining your game..."}
          </h2>
          <p
            className="text-gray-500 dark:text-gray-400"
            role="status"
            aria-live="polite"
          >
            {gameMessage || "Loading room details."}
          </p>
          {joinFailed && (
            <Button variant="basketball" size="lg" onClick={handleNewGame}>
              Start a new game
            </Button>
          )}
        </div>
      </EmbedShell>
    );
  }

  return (
    <EmbedShell
      title="HoopNerd vs CPU"
      headerRight={
        <Badge variant={isConnected ? "success" : "error"} size="sm">
          {isConnected ? "Online" : "Offline"}
        </Badge>
      }
    >
      <p className="sr-only" role="status" aria-live="polite">
        {gameMessage}
      </p>

      {winner ? (
        <div className="text-center py-10 space-y-3">
          <Trophy className="h-14 w-14 text-warning mx-auto" aria-hidden="true" />
          <h2 className="font-title text-3xl font-bold text-warning-dark dark:text-warning-light">
            {winner.name} Wins!
          </h2>
          <p className="text-gray-600 dark:text-gray-300 font-medium">
            {winReason}
          </p>
          <div className="flex gap-3 pt-4">
            <Button
              variant="basketball"
              size="lg"
              className="flex-1"
              onClick={handleNewGame}
            >
              Play again
            </Button>
          </div>
        </div>
      ) : (
        <>
          <GameBoard
            roomState={roomState}
            activePlayer={activePlayer}
            isMyTurn={isMyTurn}
            timeRemaining={timeRemaining}
            cpuThinking={cpuThinking}
            gameMessage={gameMessage}
            isCpuOpponent
            chainSubtitle={`Connect players who shared a team${describeSeasonWindow(
              roomState,
            )}.`}
            onSubmitMove={handleSubmitMove}
          />

          <Button
            variant="secondary"
            size="sm"
            onClick={handleNewGame}
            aria-label="Leave this game and start a new one"
          >
            <span className="inline-flex items-center gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              New game
            </span>
          </Button>
        </>
      )}
    </EmbedShell>
  );
}
