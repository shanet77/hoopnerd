"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Flame, Medal, Trophy } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardTitle } from "@repo/ui/card";
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
        <Card className="max-w-md w-full">
          <CardContent className="py-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-100 dark:bg-brand-900/40 rounded-2xl">
                <Flame className="h-8 w-8 text-basketball" aria-hidden="true" />
              </div>
              <CardTitle>Solo Streak</CardTitle>
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
          </CardContent>
        </Card>
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
            <div className="flex items-center gap-2 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-xl border-2 border-gray-200 dark:border-gray-700">
              <span
                className="font-bold text-gray-700 dark:text-gray-300"
                aria-label={`Current streak ${streak}`}
              >
                🔥 {streak}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-xl border-2 border-gray-200 dark:border-gray-700">
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
          <Card className="text-center py-8">
            <CardContent>
              <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-100 dark:bg-brand-900/40 rounded-2xl mb-4">
                <Basketball className="h-8 w-8 text-basketball animate-spin" />
              </div>
              <CardTitle>Starting Run...</CardTitle>
              <p
                className="text-gray-500 dark:text-gray-400 mt-2"
                role="status"
                aria-live="polite"
              >
                {isStarting
                  ? "Picking your starting player."
                  : "Run unavailable."}
              </p>
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
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <span
              className="font-title text-3xl font-bold text-gray-800 dark:text-gray-100"
              aria-live="polite"
            >
              {streak}
            </span>
            <span className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
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
      </CardContent>
    </Card>
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
      <Card className="text-center py-8 bg-warning-light/50 dark:bg-warning-dark/20 border-warning/30">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-warning rounded-full mx-auto mb-4 shadow-lg ring-4 ring-warning/30">
          <Trophy className="h-10 w-10 text-white" aria-hidden="true" />
        </div>
        <CardTitle className="text-3xl text-warning-dark dark:text-warning-light mb-2">
          {endInfo.streak}-Player Streak
        </CardTitle>
        <p className="text-gray-600 dark:text-gray-300 font-medium">
          {endInfo.endReason
            ? END_REASON_COPY[endInfo.endReason]
            : endInfo.message}
        </p>
        {endInfo.isNewBest && (
          <div className="mt-4">
            <FeedbackBanner variant="success">
              New personal best!
            </FeedbackBanner>
          </div>
        )}
        {!endInfo.isNewBest && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
            Personal best: {personalBest}
          </p>
        )}
      </Card>
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
