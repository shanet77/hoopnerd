"use client";

import { Button } from "@repo/ui/button";

export function SoloStatusCard({
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
