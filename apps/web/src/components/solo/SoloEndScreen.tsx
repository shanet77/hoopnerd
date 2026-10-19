"use client";

import { Trophy } from "lucide-react";
import { Button } from "@repo/ui/button";
import { FeedbackBanner } from "@repo/ui/feedback-banner";
import type { SoloEndReason } from "@repo/types";

const END_REASON_COPY: Record<SoloEndReason, string> = {
  stuck: "No players left to connect — dead end.",
  repeat: "That player was already used in this chain.",
  invalid: "Those two never played together — wrong connection.",
  forfeit: "You banked your streak and walked away.",
};

export function SoloEndScreen({
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
