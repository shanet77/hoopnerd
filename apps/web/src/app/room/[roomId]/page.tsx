"use client";

import { useState } from "react";
import { ArrowLeft, Trophy } from "lucide-react";
import { Basketball } from "../../../components/icons/Basketball";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Button } from "@repo/ui/button";
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
        <div className="max-w-md w-full text-center space-y-3">
          <Basketball className="h-10 w-10 text-basketball animate-spin mx-auto" aria-hidden="true" />
          <h2 className="font-title text-xl font-bold text-gray-800 dark:text-gray-100">
            Connecting...
          </h2>
          <p className="text-gray-500 dark:text-gray-400" role="status" aria-live="polite">
            Preparing your session.
          </p>
        </div>
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
          <div className="text-center py-10 space-y-3">
            <Basketball className="h-10 w-10 text-basketball animate-spin mx-auto" aria-hidden="true" />
            <h2 className="font-title text-xl font-bold text-gray-800 dark:text-gray-100">
              Joining Room...
            </h2>
            <p className="text-gray-500 dark:text-gray-400">Loading room details.</p>
            {gameMessage && (
              <p className="text-sm font-semibold text-warning-dark dark:text-warning-light">
                {gameMessage}
              </p>
            )}
          </div>
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
          className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-md"
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
      <div className="text-center py-10 space-y-3">
        <Trophy className="h-14 w-14 text-warning mx-auto" aria-hidden="true" />
        <h2 className="font-title text-3xl font-bold text-warning-dark dark:text-warning-light">
          {winner.name} Wins!
        </h2>
        <p className="text-gray-600 dark:text-gray-300 font-medium">{winReason}</p>
      </div>
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onLeave}>
          Back to Lobby
        </Button>
      </div>
    </div>
  );
}
