"use client";

import { CircleX } from "lucide-react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@repo/ui/button";
import ClientOnly from "../../../components/ClientOnly";
import {
  EmbedShell,
  FALLBACK_FULL_APP_PATH,
} from "../../../components/embed/EmbedShell";
import { EmbedCreator } from "../../../components/embed/EmbedCreator";
import { EmbedRoom } from "../../../components/embed/EmbedRoom";
import { SocketProvider } from "../../lib/socket";
import { useEmbedGamePhase } from "./useEmbedGamePhase";

// Never prerendered: the game is created per visit and reads ?name=&min=&max=.
export const dynamic = "force-dynamic";

export default function EmbedCpuGame() {
  return (
    <ClientOnly>
      <EmbedGame />
    </ClientOnly>
  );
}

/**
 * Composes the embed lifecycle. Each phase mounts its own SocketProvider so
 * the socket lifecycle mirrors the lobby -> room navigation the server
 * was designed for:
 *
 *  - "starting": a short-lived socket calls create_cpu_game, persists the
 *    returned session token, then unmounts (disconnect starts the
 *    server's 10s grace timer, not an instant forfeit).
 *  - "playing": a fresh socket reconnects and useGameRoom restores the
 *    session via the join_room token path.
 */
function EmbedGame() {
  const searchParams = useSearchParams();
  const {
    phase,
    failureMessage,
    roomId,
    playerName,
    attempt,
    handleCreated,
    handleCreateFailed,
    handlePlayAgain,
    handleRetry,
  } = useEmbedGamePhase();

  if (phase === "failed") {
    return (
      <EmbedShell title="HoopNerd vs CPU">
        <div className="text-center py-8 space-y-4">
          <CircleX
            className="h-10 w-10 mx-auto text-error"
            aria-hidden="true"
          />
          <h2 className="font-title text-xl font-bold text-gray-800 dark:text-gray-100">
            Couldn&apos;t start the game
          </h2>
          <p className="text-gray-500 dark:text-gray-400">{failureMessage}</p>
          <div className="flex flex-col gap-2">
            <Button variant="basketball" size="lg" onClick={handleRetry}>
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

  if (phase === "playing" && roomId !== null) {
    return (
      <SocketProvider key={`play-${roomId}-${attempt}`}>
        <EmbedRoom
          roomId={roomId}
          playerName={playerName}
          onPlayAgain={handlePlayAgain}
        />
      </SocketProvider>
    );
  }

  return (
    <SocketProvider key={`create-${attempt}`}>
      <EmbedCreator
        requestedName={searchParams.get("name")}
        requestedMin={searchParams.get("min")}
        requestedMax={searchParams.get("max")}
        onCreated={handleCreated}
        onFailed={handleCreateFailed}
      />
    </SocketProvider>
  );
}
