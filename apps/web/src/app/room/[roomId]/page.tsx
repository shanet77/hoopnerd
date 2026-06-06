"use client";

import { useState, FormEvent } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardTitle } from "@repo/ui/card";
import { Badge } from "@repo/ui/badge";
import { FeedbackBanner } from "@repo/ui/feedback-banner";
import { SocketProvider, useSocket } from "../../lib/socket";
import { useGameRoom } from "../../lib/useGameRoom";
import { Player } from "@repo/types";
import ClientOnly from "../../../components/ClientOnly";
import { PlayerGraph } from "../../../components/game/PlayerGraph";
import { PlayerSearch } from "../../../components/game/PlayerSearch";
import { MoveHistory } from "../../../components/game/MoveHistory";
import { PlayerList } from "../../../components/game/PlayerList";
import { GameStatusBanner } from "../../../components/game/GameStatusBanner";

export default function Room() {
  return (
    <ClientOnly>
      <SocketProviderWrapper />
    </ClientOnly>
  );
}

function SocketProviderWrapper() {
  return (
    <SocketProvider>
      <GamePage />
    </SocketProvider>
  );
}

function GamePage() {
  const { socket, isConnected: socketConnected } = useSocket();
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const playerName = searchParams.get("playerName") || "Player";

  const {
    activePlayer,
    timeRemaining,
    winner,
    winReason,
    roomState,
    gameMessage,
    isConnected,
    isMyTurn,
    isCpuOpponent,
    cpuThinking,
    handleSubmitMove,
    handleLeaveRoom,
  } = useGameRoom(socket, socketConnected, roomId, playerName);

  const [connectedPlayer, setConnectedPlayer] = useState<Player | null>(null);
  const apiHost = process.env.NEXT_PUBLIC_API_HOST || "http://localhost:3001";

  const onLeave = () => {
    handleLeaveRoom();
    router.push("/");
  };

  const onSubmitMove = async (e: FormEvent) => {
    e.preventDefault();
    if (!connectedPlayer) return;

    const response = await handleSubmitMove(connectedPlayer);
    if (response.success) {
      setConnectedPlayer(null);
    }
  };

  if (!socket) {
    return (
      <main
        id="main-content"
        className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4"
      >
        <Card className="max-w-md w-full text-center">
          <CardContent className="py-12 space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-100 dark:bg-brand-900/40 rounded-2xl animate-pulse">
              <span className="text-3xl">🏀</span>
            </div>
            <CardTitle>Connecting...</CardTitle>
            <p className="text-gray-500 dark:text-gray-400" role="status" aria-live="polite">
              Setting up your game!
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main id="main-content" className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <p className="sr-only" role="status" aria-live="polite">
          {gameMessage}
        </p>

        <GameHeader
          roomId={roomId}
          isConnected={isConnected}
          onLeave={onLeave}
          seasonYearMin={roomState?.seasonYearMin}
          seasonYearMax={roomState?.seasonYearMax}
        />

        {winner ? (
          <GameOverScreen
            winner={winner}
            winReason={winReason}
            onLeave={onLeave}
          />
        ) : roomState ? (
          <>
            <GameStatusBanner
              roomState={roomState}
              activePlayer={activePlayer}
              isMyTurn={isMyTurn}
              timeRemaining={timeRemaining}
              isCpuOpponent={isCpuOpponent}
            />

            {gameMessage.includes("Invalid") ||
            gameMessage.includes("not play with") ? (
              <FeedbackBanner variant="error" icon="❌">
                {gameMessage}
              </FeedbackBanner>
            ) : null}

            {gameMessage &&
            !gameMessage.includes("Invalid") &&
            (gameMessage.includes("turn") ||
              gameMessage.includes("thinking")) ? (
              <FeedbackBanner variant="info">{gameMessage}</FeedbackBanner>
            ) : null}

            <Card>
              <CardContent className="py-4">
                <h2 className="font-title text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">
                  Player Chain
                </h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                  Build the longest chain of connected players!
                </p>
                {roomState.gameStarted && roomState.startingPlayer ? (
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border-2 border-gray-100 dark:border-gray-800">
                    <PlayerGraph
                      startingPlayer={roomState.startingPlayer}
                      connections={roomState.connections}
                    />
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <span className="text-4xl block mb-2">⏳</span>
                    Waiting for game to start...
                  </div>
                )}
              </CardContent>
            </Card>

            <PlayerList
              players={roomState.players}
              activePlayer={activePlayer}
            />

            {isMyTurn && roomState.gameStarted && (
              <Card className="bg-success-light/30 dark:bg-success-dark/20 border-success/30">
                <CardContent className="py-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">🎯</span>
                    <h2 className="font-title text-xl font-bold text-gray-800 dark:text-gray-100">
                      Make Your Move
                    </h2>
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                    Connect a player to{" "}
                    <strong>
                      {roomState.lastConnectedPlayer?.name ||
                        roomState.startingPlayer?.name}
                    </strong>{" "}
                    who shared a team
                    {roomState.seasonYearMin !== undefined && roomState.seasonYearMax !== undefined
                      ? ` during ${roomState.seasonYearMin}–${roomState.seasonYearMax} seasons`
                      : " and season"}
                    !
                  </p>
                  <form onSubmit={onSubmitMove} className="space-y-4">
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
                      {connectedPlayer ? "Submit Move →" : "Select a Player"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {!isMyTurn && roomState.gameStarted && (
              <Card
                className={`${cpuThinking ? "bg-brand-50 dark:bg-brand-900/40 border-brand-200" : "bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600"}`}
              >
                <CardContent className="py-6 text-center">
                  <div
                    className={`text-4xl mb-2 ${cpuThinking ? "animate-pulse" : ""}`}
                  >
                    {cpuThinking ? "🧠" : "⏰"}
                  </div>
                  <p className="font-bold text-gray-600 dark:text-gray-300">
                    {cpuThinking
                      ? "🤖 CPU is thinking..."
                      : `Waiting for ${activePlayer?.name}'s move...`}
                  </p>
                </CardContent>
              </Card>
            )}

            {!roomState.gameStarted && (
              <Card className="bg-warning-light/30 dark:bg-warning-dark/20 border-warning/30">
                <CardContent className="py-6 text-center">
                  <div className="text-4xl mb-2">👥</div>
                  <p className="font-bold text-warning-dark dark:text-warning-light">
                    Waiting for more players...
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                    Share the room code with friends!
                  </p>
                </CardContent>
              </Card>
            )}

            <MoveHistory moves={roomState.moves} />
          </>
        ) : (
          <Card className="text-center py-8">
            <CardContent>
              <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-100 dark:bg-brand-900/40 rounded-2xl animate-pulse mb-4">
                <span className="text-3xl">🏀</span>
              </div>
              <CardTitle>Joining Room...</CardTitle>
              <p className="text-gray-500 dark:text-gray-400 mt-2">Getting everything ready!</p>
              {gameMessage && (
                <p className="text-sm font-semibold text-warning-dark dark:text-warning-light mt-3">
                  {gameMessage}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

function GameHeader({
  roomId,
  isConnected,
  onLeave,
  seasonYearMin,
  seasonYearMax,
}: {
  roomId: string;
  isConnected: boolean;
  onLeave: () => void;
  seasonYearMin?: number;
  seasonYearMax?: number;
}) {
  const [copied, setCopied] = useState(false);

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex items-center justify-between">
      <Button
        variant="secondary"
        size="sm"
        onClick={onLeave}
        aria-label="Leave room and return to lobby"
      >
        ← Leave
      </Button>
      <Badge
        variant={isConnected ? "success" : "error"}
        size="sm"
        aria-live="polite"
      >
        {isConnected ? "Online" : "Offline"}
      </Badge>
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-2 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-xl border-2 border-gray-200 dark:border-gray-700"
          role="group"
          aria-label={`Room code ${roomId}`}
        >
          <span className="text-lg">🏀</span>
          <span className="font-bold text-gray-700 dark:text-gray-300">{roomId}</span>
          <button
            type="button"
            onClick={copyRoomCode}
            className="text-xs font-bold text-brand-600 hover:text-brand-800 transition-colors ml-1"
            aria-label="Copy room code"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        {seasonYearMin !== undefined && seasonYearMax !== undefined && (
          <Badge variant="info" size="sm">
            {seasonYearMin}–{seasonYearMax}
          </Badge>
        )}
      </div>
    </div>
  );
}

function GameOverScreen({
  winner,
  winReason,
  onLeave,
}: {
  winner: Player;
  winReason: string;
  onLeave: () => void;
}) {
  return (
    <div className="space-y-6">
      <Card className="text-center py-8 bg-warning-light/50 dark:bg-warning-dark/20 border-warning/30">
        <div className="inline-flex items-center justify-center w-24 h-24 bg-warning rounded-full mx-auto mb-4 shadow-lg animate-bounce">
          <span className="text-5xl">🏆</span>
        </div>
        <CardTitle className="text-3xl text-warning-dark dark:text-warning-light mb-2">
          {winner.name} Wins!
        </CardTitle>
        <p className="text-gray-600 dark:text-gray-300 font-medium">{winReason}</p>
      </Card>
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onLeave}>
          Back to Lobby
        </Button>
      </div>
    </div>
  );
}
