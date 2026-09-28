"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CircleX, Trophy } from "lucide-react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardTitle } from "@repo/ui/card";
import { Badge } from "@repo/ui/badge";
import { Basketball } from "../../../components/icons/Basketball";
import ClientOnly from "../../../components/ClientOnly";
import {
  GameBoard,
  describeSeasonWindow,
} from "../../../components/game/GameBoard";
import { SocketProvider, useSocket, createCpuGame } from "../../lib/socket";
import { useGameRoom } from "../../lib/useGameRoom";
import { useAvailableSeasons } from "../../lib/useAvailableSeasons";
import { setPlayerSession } from "../../lib/playerSession";
import { trackEvent } from "../../lib/analytics";
import {
  buildGameOverPayload,
  postGameOverToParent,
  postReadyToParent,
  resolveEmbedPlayerName,
  resolveEmbedSeasonParams,
} from "./embed-protocol";

// Never prerendered: the game is created per visit and reads ?name=&min=&max=.
export const dynamic = "force-dynamic";

type EmbedPhase = "starting" | "playing" | "failed";

const FALLBACK_FULL_APP_PATH = "/";

export default function EmbedCpuGame() {
  return (
    <ClientOnly>
      <EmbedGame />
    </ClientOnly>
  );
}

/**
 * Owns the embed lifecycle. Each phase mounts its own SocketProvider so
 * the socket lifecycle mirrors the lobby -> room navigation the server
 * was designed for:
 *
 *  - "starting": a short-lived socket calls create_cpu_game, persists the
 *    returned session token, then unmounts (disconnect starts the
 *    server's 10s grace timer, not an instant forfeit).
 *  - "playing": a fresh socket reconnects and useGameRoom restores the
 *    session via the join_room token path.
 */
function EmbedGame() {
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<EmbedPhase>("starting");
  const [failureMessage, setFailureMessage] = useState("");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState("Guest");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    postReadyToParent();
  }, []);

  const handleCreated = useCallback((room: string, name: string) => {
    setPlayerName(name);
    setRoomId(room);
    setPhase("playing");
  }, []);

  const handleCreateFailed = useCallback((message: string) => {
    setFailureMessage(message);
    setPhase("failed");
  }, []);

  const handlePlayAgain = useCallback(() => {
    setRoomId(null);
    setPhase("starting");
    setAttempt((n) => n + 1);
  }, []);

  const handleRetry = useCallback(() => {
    setPhase("starting");
    setAttempt((n) => n + 1);
  }, []);

  const requestedName = searchParams.get("name");
  const requestedMin = searchParams.get("min");
  const requestedMax = searchParams.get("max");

  if (phase === "failed") {
    return (
      <EmbedShell title="HoopNerd vs CPU">
        <Card className="text-center py-8">
          <CardContent className="space-y-4">
            <CircleX
              className="h-10 w-10 mx-auto text-error"
              aria-hidden="true"
            />
            <CardTitle>Couldn&apos;t start the game</CardTitle>
            <p className="text-gray-500 dark:text-gray-400">{failureMessage}</p>
            <div className="flex flex-col gap-2">
              <Button variant="basketball" size="lg" onClick={handleRetry}>
                Try again
              </Button>
              <Link
                href={FALLBACK_FULL_APP_PATH}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-bold text-brand-600 hover:text-brand-800"
              >
                Open HoopNerd in a new tab
              </Link>
            </div>
          </CardContent>
        </Card>
      </EmbedShell>
    );
  }

  if (phase === "playing" && roomId !== null) {
    return (
      <SocketProvider key={`play-${roomId}-${attempt}`}>
        <EmbedRoom
          roomId={roomId}
          playerName={playerName}
          onPlayAgain={handlePlayAgain}
        />
      </SocketProvider>
    );
  }

  return (
    <SocketProvider key={`create-${attempt}`}>
      <EmbedCreator
        requestedName={requestedName}
        requestedMin={requestedMin}
        requestedMax={requestedMax}
        onCreated={handleCreated}
        onFailed={handleCreateFailed}
      />
    </SocketProvider>
  );
}

/** Short-lived: creates one CPU game, persists the session, then unmounts. */
function EmbedCreator({
  requestedName,
  requestedMin,
  requestedMax,
  onCreated,
  onFailed,
}: {
  requestedName: string | null;
  requestedMin: string | null;
  requestedMax: string | null;
  onCreated: (roomId: string, playerName: string) => void;
  onFailed: (message: string) => void;
}) {
  const { socket, isConnected: socketConnected } = useSocket();
  const { minYear, maxYear, loading: seasonsLoading } = useAvailableSeasons();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    if (!socket || !socketConnected) return;
    // Wait for the seasons list so clamped presets don't silently
    // become "All Time".
    if (seasonsLoading) return;
    startedRef.current = true;

    let cancelled = false;

    const createGame = async () => {
      const name = resolveEmbedPlayerName(requestedName);
      const { min, max } = resolveEmbedSeasonParams(
        requestedMin,
        requestedMax,
        minYear,
        maxYear,
      );

      try {
        const response = await createCpuGame(socket, {
          playerName: name,
          difficulty: "easy",
          seasonYearMin: min,
          seasonYearMax: max,
        });
        if (cancelled) return;
        if (
          response.success &&
          response.roomId &&
          response.playerToken &&
          typeof response.playerId === "number"
        ) {
          trackEvent("embed_cpu_game_created", { difficulty: "easy" });
          // Persist before unmounting so the playing-phase socket
          // restores this session (same as the lobby -> room flow).
          setPlayerSession(response.roomId, name, {
            token: response.playerToken,
            playerId: response.playerId,
          });
          onCreated(response.roomId, name);
        } else {
          onFailed(
            response.message || "Could not start a CPU game. Please try again.",
          );
        }
      } catch (error) {
        if (cancelled) return;
        console.error("Error starting embedded CPU game:", error);
        onFailed(
          "Could not reach the game server. Please check your connection and try again.",
        );
      }
    };

    void createGame();
    return () => {
      cancelled = true;
    };
  }, [
    socket,
    socketConnected,
    seasonsLoading,
    requestedName,
    requestedMin,
    requestedMax,
    minYear,
    maxYear,
    onCreated,
    onFailed,
  ]);

  return (
    <EmbedShell title="HoopNerd vs CPU">
      <Card className="text-center py-10">
        <CardContent className="space-y-4">
          <Basketball
            className="h-10 w-10 mx-auto text-basketball animate-spin"
            aria-hidden="true"
          />
          <CardTitle>
            {!socket ? "Connecting..." : "Starting your game..."}
          </CardTitle>
          <p
            className="text-gray-500 dark:text-gray-400"
            role="status"
            aria-live="polite"
          >
            Warming up BronBot.
          </p>
        </CardContent>
      </Card>
    </EmbedShell>
  );
}

function EmbedRoom({
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
        <Card className="text-center py-10">
          <CardContent className="space-y-4">
            <Basketball
              className="h-10 w-10 mx-auto text-basketball animate-spin"
              aria-hidden="true"
            />
            <CardTitle>
              {joinFailed ? "Couldn't rejoin the game" : "Joining your game..."}
            </CardTitle>
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
          </CardContent>
        </Card>
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
        <Card className="text-center py-8 bg-warning-light/50 dark:bg-warning-dark/20 border-warning/30">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-warning rounded-full mx-auto mb-4 shadow-lg ring-4 ring-warning/30">
            <Trophy className="h-10 w-10 text-white" aria-hidden="true" />
          </div>
          <CardTitle className="text-3xl text-warning-dark dark:text-warning-light mb-2">
            {winner.name} Wins!
          </CardTitle>
          <p className="text-gray-600 dark:text-gray-300 font-medium">
            {winReason}
          </p>
          <div className="flex gap-3 mt-6 px-6">
            <Button
              variant="basketball"
              size="lg"
              className="flex-1"
              onClick={handleNewGame}
            >
              Play again
            </Button>
          </div>
        </Card>
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

function EmbedShell({
  title,
  headerRight,
  children,
}: {
  title: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main
      id="main-content"
      className="min-h-screen bg-gray-50 dark:bg-gray-900 py-4 px-3"
    >
      <div className="max-w-xl mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Basketball
              className="h-6 w-6 text-basketball"
              aria-hidden="true"
            />
            <h1 className="font-title text-xl font-bold text-gray-800 dark:text-gray-100">
              {title}
            </h1>
          </div>
          {headerRight}
        </div>
        {children}
        <p className="text-center text-xs text-gray-400 dark:text-gray-500 font-medium">
          Full experience at{" "}
          <Link
            href={FALLBACK_FULL_APP_PATH}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            HoopNerd
          </Link>
        </p>
      </div>
    </main>
  );
}
