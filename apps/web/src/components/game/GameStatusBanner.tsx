import React from "react";
import { Player, GameRoomState } from "@repo/types";
import { TimerBar } from "@repo/ui/timer-bar";

interface GameStatusBannerProps {
  roomState: GameRoomState;
  activePlayer: Player | null;
  isMyTurn: boolean;
  timeRemaining: number;
}

export function GameStatusBanner({
  roomState,
  activePlayer,
  isMyTurn,
  timeRemaining,
}: GameStatusBannerProps) {
  const isUrgent = timeRemaining <= 5;
  const isCpuTurn = activePlayer?.isCpu ?? false;

  return (
    <div>
      <div className="flex items-end justify-between mb-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            Current Turn
          </p>
          <p
            className="font-title text-2xl font-bold text-gray-800 dark:text-gray-100 leading-tight"
            aria-live="polite"
          >
            {isMyTurn ? "Your turn" : activePlayer?.name}
            {isCpuTurn && !isMyTurn ? " (CPU)" : ""}
          </p>
        </div>
        <span
          className={`font-title text-3xl font-bold tabular-nums ${
            isUrgent ? "text-error countdown-pulse" : "text-gray-700 dark:text-gray-300"
          }`}
        >
          {timeRemaining}s
        </span>
      </div>
      <TimerBar value={timeRemaining} max={25} urgentThreshold={5} />
      <p className="mt-2 text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
        {roomState.moves.length} moves made
      </p>
    </div>
  );
}
