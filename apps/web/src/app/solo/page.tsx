"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Flame, Medal, Trophy } from "lucide-react";
import { Button } from "@repo/ui/button";
import { FeedbackBanner } from "@repo/ui/feedback-banner";
import type { SoloEndReason } from "@repo/types";
import { SocketProvider, useSocket } from "../lib/socket";
import { useSoloRun } from "../lib/useSoloRun";
import { getPlayerName, setPlayerName } from "../lib/playerSession";
import { trackEvent } from "../lib/analytics";
import ClientOnly from "../../components/ClientOnly";
import { InlineNamePrompt } from "../../components/lobby/InlineNamePrompt";
import { GameBoard } from "../../components/game/GameBoard";
import { Basketball } from "../../components/icons/Basketball";

const END_REASON_COPY: Record<SoloEndReason, string> = {
  stuck: "No players left to connect — dead end.",
  repeat: "That player was already used in this chain.",
  invalid: "Those two never played together — wrong connection.",
  forfeit: "You banked your streak and walked away.",
};

export default function Solo() {
  return (
    <ClientOnly>
      <SocketProviderWrapper />
    </ClientOnly>
  );
}

function SocketProviderWrapper() {
  return (
    <SocketProvider>
      <SoloPage />
    </SocketProvider>
  );
}

function SoloPage() {
  const { socket, isConnected: socketConnected } = useSocket();
  const router = useRouter();
  const [playerName, setPlayerNameState] = useState<string>(() =>
    getPlayerName(),
  );

  const {
    runState,
    gameMessage,
    personalBest,
    endInfo,
    isStarting,
    handleSubmitMove,
    handleEndRun,
    handleNewRun,
  } = useSoloRun(socket, socketConnected, playerName);

  const onLeave = () => {
    router.push("/");
  };

  if (!playerName) {
    return (
      <main
        id="main-content"
        className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4"
      >
        <div className="max-w-md w-full space-y-6">
          <div className="text-center space-y-2">
            <Flame className="h-10 w-10 text-basketball mx-auto" aria-hidden="true" />
            <h2 className="font-title text-2xl font-bold text-gray-800 dark:text-gray-100">
              Solo Streak
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Chain players who shared a team-season. No timer — but one wrong
              guess ends the run.
            </p>
          </div>
          <InlineNamePrompt
            value={playerName}
            onChange={(value) => {
              setPlayerNameState(value);
              setPlayerName(value);
            }}
          />
          <Button
            variant="secondary"
            className="w-full"
            onClick={onLeave}
            aria-label="Back to lobby"
          >
            <span className="inline-flex items-center gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Back to Lobby
            </span>
          </Button>
        </div>
      </main>
    );
  }

  const streak = runState?.moves.length ?? 0;

  return (
    <main
      id="main-content"
      className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6 px-4"
    >
      <div className="max-w-2xl mx-auto space-y-4">
        <p className="sr-only" role="status" aria-live="polite">
          {gameMessage}
        </p>

        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            size="sm"
            onClick={onLeave}
            aria-label="Leave solo run and return to lobby"
          >
            <span className="inline-flex items-center gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Leave
            </span>
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-md">
              <span
                className="font-bold text-gray-700 dark:text-gray-300"
                aria-label={`Current streak ${streak}`}
              >
                🔥 {streak}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-md">
              <Medal className="h-5 w-5 text-basketball" aria-hidden="true" />
              <span
                className="font-bold text-gray-700 dark:text-gray-300"
                aria-label={`Personal best ${personalBest}`}
              >
                PB {personalBest}
              </span>
            </div>
          </div>
        </div>

        {endInfo ? (
          <SoloEndScreen
            endInfo={endInfo}
            personalBest={personalBest}
            onNewRun={() => {
              trackEvent("solo_play_again", {});
              handleNewRun();
            }}
            onLeave={onLeave}
          />
        ) : runState ? (
          <GameBoard
            roomState={runState}
            activePlayer={null}
            isMyTurn={!runState.gameCompleted}
            timeRemaining={0}
            cpuThinking={false}
            gameMessage={gameMessage}
            isCpuOpponent={false}
            showPlayerList={false}
            showMovePrompt={false}
            onSubmitMove={handleSubmitMove}
            statusSlot={
              <SoloStatusCard
                streak={streak}
                personalBest={personalBest}
                onEndRun={handleEndRun}
              />
            }
          />
        ) : (
          <div className="text-center py-10 space-y-3">
            <Basketball className="h-10 w-10 text-basketball animate-spin mx-auto" aria-hidden="true" />
            <h2 className="font-title text-xl font-bold text-gray-800 dark:text-gray-100">
              Starting Run...
            </h2>
            <p
              className="text-gray-500 dark:text-gray-400"
              role="status"
              aria-live="polite"
            >
              {isStarting
                ? "Picking your starting player."
                : "Run unavailable."}
            </p>
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

function SoloStatusCard({
  streak,
  personalBest,
  onEndRun,
}: {
  streak: number;
  personalBest: number;
  onEndRun: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-baseline gap-3">
        <span
          className="font-title text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums"
          aria-live="polite"
        >
          {streak}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
          streak
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
          Best: {personalBest}
        </span>
        <Button variant="outline" size="sm" onClick={onEndRun}>
          End Run
        </Button>
      </div>
    </div>
  );
}

function SoloEndScreen({
  endInfo,
  personalBest,
  onNewRun,
  onLeave,
}: {
  endInfo: {
    streak: number;
    endReason?: SoloEndReason;
    isNewBest: boolean;
    message: string;
  };
  personalBest: number;
  onNewRun: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center py-10 space-y-3">
        <Trophy className="h-14 w-14 text-warning mx-auto" aria-hidden="true" />
        <h2 className="font-title text-3xl font-bold text-warning-dark dark:text-warning-light">
          {endInfo.streak}-Player Streak
        </h2>
        <p className="text-gray-600 dark:text-gray-300 font-medium">
          {endInfo.endReason
            ? END_REASON_COPY[endInfo.endReason]
            : endInfo.message}
        </p>
        {endInfo.isNewBest && (
          <div className="pt-2">
            <FeedbackBanner variant="success">
              New personal best!
            </FeedbackBanner>
          </div>
        )}
        {!endInfo.isNewBest && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Personal best: {personalBest}
          </p>
        )}
      </div>
      <div className="flex gap-3">
        <Button variant="primary" className="flex-1" onClick={onNewRun}>
          Play Again
        </Button>
        <Button variant="secondary" className="flex-1" onClick={onLeave}>
          Back to Lobby
        </Button>
      </div>
    </div>
  );
}
