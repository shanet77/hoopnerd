"use client";

import { CircleX } from "lucide-react";
import Link from "next/link";
import { Button } from "@repo/ui/button";
import { EmbedShell, FALLBACK_FULL_APP_PATH } from "./EmbedShell";

export function EmbedFailure({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <EmbedShell title="HoopNerd vs CPU">
      <div className="text-center py-8 space-y-4">
        <CircleX className="h-10 w-10 mx-auto text-error" aria-hidden="true" />
        <h2 className="font-title text-xl font-bold text-gray-800 dark:text-gray-100">
          Couldn&apos;t start the game
        </h2>
        <p className="text-gray-500 dark:text-gray-400">{message}</p>
        <div className="flex flex-col gap-2">
          <Button variant="basketball" size="lg" onClick={onRetry}>
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
      </div>
    </EmbedShell>
  );
}
