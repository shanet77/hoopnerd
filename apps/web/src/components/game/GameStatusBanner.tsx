"use client";

import React from "react";
import { Player, GameRoomState } from "@repo/types";
import { Card, CardContent, CardTitle } from "@repo/ui/card";
import { TimerBar } from "@repo/ui/timer-bar";
import { Badge } from "@repo/ui/badge";

interface GameStatusBannerProps {
  roomState: GameRoomState;
  activePlayer: Player | null;
  isMyTurn: boolean;
  timeRemaining: number;
  isCpuOpponent?: boolean;
}

export function GameStatusBanner({
  roomState,
  activePlayer,
  isMyTurn,
  timeRemaining,
  isCpuOpponent,
}: GameStatusBannerProps) {
  const isUrgent = timeRemaining <= 5;
  const isCpuTurn = activePlayer?.isCpu ?? false;

  return (
    <Card className="bg-white">
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Current Turn
          </span>
          <Badge
            variant={isMyTurn ? "basketball" : "info"}
            size="lg"
            aria-live="polite"
          >
            {isMyTurn
              ? "🎯 Your Turn!"
              : isCpuTurn
                ? `🤖 ${activePlayer?.name}`
                : activePlayer?.name}
          </Badge>
        </div>
        <TimerBar value={timeRemaining} max={25} urgentThreshold={5} />
        <div className="flex justify-between mt-2">
          <span
            className={`font-bold text-2xl ${
              isUrgent ? "text-error countdown-pulse" : "text-gray-700 dark:text-gray-300"
            }`}
          >
            {timeRemaining}s
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
            {roomState.moves.length} moves made
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
