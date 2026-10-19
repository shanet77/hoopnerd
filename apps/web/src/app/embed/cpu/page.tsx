"use client";

import { useSearchParams } from "next/navigation";
import ClientOnly from "../../../components/ClientOnly";
import { EmbedCreator } from "../../../components/embed/EmbedCreator";
import { EmbedRoom } from "../../../components/embed/EmbedRoom";
import { EmbedFailure } from "../../../components/embed/EmbedFailure";
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
    return <EmbedFailure message={failureMessage} onRetry={handleRetry} />;
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
