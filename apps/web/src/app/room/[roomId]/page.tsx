"use client";

import { useState } from "react";
import { ArrowLeft, Trophy } from "lucide-react";
import { Basketball } from "../../../components/icons/Basketball";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardTitle } from "@repo/ui/card";
import { Badge } from "@repo/ui/badge";
import { SocketProvider, useSocket } from "../../lib/socket";
import { useGameRoom } from "../../lib/useGameRoom";
import { Player } from "@repo/types";
import ClientOnly from "../../../components/ClientOnly";
import { GameBoard } from "../../../components/game/GameBoard";

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

  const onLeave = () => {
    handleLeaveRoom();
    router.push("/");
  };

  if (!socket) {
    return (
      <main
        id="main-content"
        className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4"
      >
        <Card className="max-w-md w-full text-center">
          <CardContent className="py-12 space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-100 dark:bg-brand-900/40 rounded-2xl">
              <Basketball className="h-8 w-8 text-basketball animate-spin" />
            </div>
            <CardTitle>Connecting...</CardTitle>
            <p className="text-gray-500 dark:text-gray-400" role="status" aria-live="polite">
              Preparing your session.
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
          <GameBoard
            roomState={roomState}
            activePlayer={activePlayer}
            isMyTurn={isMyTurn}
            timeRemaining={timeRemaining}
            cpuThinking={cpuThinking}
            gameMessage={gameMessage}
            isCpuOpponent={isCpuOpponent}
            chainSubtitle="Build the longest chain of connected players."
            onSubmitMove={handleSubmitMove}
          />
        ) : (
          <Card className="text-center py-8">
            <CardContent>
              <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-100 dark:bg-brand-900/40 rounded-2xl mb-4">
                <Basketball className="h-8 w-8 text-basketball animate-spin" />
              </div>
              <CardTitle>Joining Room...</CardTitle>
              <p className="text-gray-500 dark:text-gray-400 mt-2">Loading room details.</p>
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
        <span className="inline-flex items-center gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          Leave
        </span>
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
          <Basketball className="h-5 w-5 text-basketball" />
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
        <div className="inline-flex items-center justify-center w-20 h-20 bg-warning rounded-full mx-auto mb-4 shadow-lg ring-4 ring-warning/30">
          <Trophy className="h-10 w-10 text-white" />
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
