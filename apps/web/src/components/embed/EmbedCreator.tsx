"use client";

import { useEffect, useRef } from "react";
import { Basketball } from "../icons/Basketball";
import { createCpuGame, useSocket } from "../../app/lib/socket";
import { useAvailableSeasons } from "../../app/lib/useAvailableSeasons";
import { setPlayerSession } from "../../app/lib/playerSession";
import { trackEvent } from "../../app/lib/analytics";
import {
  resolveEmbedPlayerName,
  resolveEmbedSeasonParams,
} from "../../app/embed/cpu/embed-protocol";
import { EmbedShell } from "./EmbedShell";

/** Short-lived: creates one CPU game, persists the session, then unmounts. */
export function EmbedCreator({
  requestedName,
  requestedMin,
  requestedMax,
  onCreated,
  onFailed,
}: {
  requestedName: string | null;
  requestedMin: string | null;
  requestedMax: string | null;
  onCreated: (roomId: string, playerName: string) => void;
  onFailed: (message: string) => void;
}) {
  const { socket, isConnected: socketConnected } = useSocket();
  const { minYear, maxYear, loading: seasonsLoading } = useAvailableSeasons();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    if (!socket || !socketConnected) return;
    // Wait for the seasons list so clamped presets don't silently
    // become "All Time".
    if (seasonsLoading) return;
    startedRef.current = true;

    let cancelled = false;

    const createGame = async () => {
      const name = resolveEmbedPlayerName(requestedName);
      const { min, max } = resolveEmbedSeasonParams(
        requestedMin,
        requestedMax,
        minYear,
        maxYear,
      );

      try {
        const response = await createCpuGame(socket, {
          playerName: name,
          difficulty: "easy",
          seasonYearMin: min,
          seasonYearMax: max,
        });
        if (cancelled) return;
        if (
          response.success &&
          response.roomId &&
          response.playerToken &&
          typeof response.playerId === "number"
        ) {
          trackEvent("embed_cpu_game_created", { difficulty: "easy" });
          // Persist before unmounting so the playing-phase socket
          // restores this session (same as the lobby -> room flow).
          setPlayerSession(response.roomId, name, {
            token: response.playerToken,
            playerId: response.playerId,
          });
          onCreated(response.roomId, name);
        } else {
          onFailed(
            response.message || "Could not start a CPU game. Please try again.",
          );
        }
      } catch (error) {
        if (cancelled) return;
        console.error("Error starting embedded CPU game:", error);
        onFailed(
          "Could not reach the game server. Please check your connection and try again.",
        );
      }
    };

    void createGame();
    return () => {
      cancelled = true;
    };
  }, [
    socket,
    socketConnected,
    seasonsLoading,
    requestedName,
    requestedMin,
    requestedMax,
    minYear,
    maxYear,
    onCreated,
    onFailed,
  ]);

  return (
    <EmbedShell title="HoopNerd vs CPU">
      <div className="text-center py-10 space-y-4">
        <Basketball
          className="h-10 w-10 mx-auto text-basketball animate-spin"
          aria-hidden="true"
        />
        <h2 className="font-title text-xl font-bold text-gray-800 dark:text-gray-100">
          {!socket ? "Connecting..." : "Starting your game..."}
        </h2>
        <p
          className="text-gray-500 dark:text-gray-400"
          role="status"
          aria-live="polite"
        >
          Warming up BronBot.
        </p>
      </div>
    </EmbedShell>
  );
}
