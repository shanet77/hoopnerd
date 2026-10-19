"use client";

import { useCallback, useEffect, useState } from "react";
import { postReadyToParent } from "./embed-protocol";

export type EmbedPhase = "starting" | "playing" | "failed";

/**
 * Owns the embed lifecycle: which phase the page is in, the last failure
 * message, and the created room/session details. Rendering stays with the
 * caller so the socket lifecycle (a provider per phase) remains explicit.
 */
export function useEmbedGamePhase() {
  const [phase, setPhase] = useState<EmbedPhase>("starting");
  const [failureMessage, setFailureMessage] = useState("");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState("Guest");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    postReadyToParent();
  }, []);

  const handleCreated = useCallback((room: string, name: string) => {
    setPlayerName(name);
    setRoomId(room);
    setPhase("playing");
  }, []);

  const handleCreateFailed = useCallback((message: string) => {
    setFailureMessage(message);
    setPhase("failed");
  }, []);

  const handlePlayAgain = useCallback(() => {
    setRoomId(null);
    setPhase("starting");
    setAttempt((n) => n + 1);
  }, []);

  const handleRetry = useCallback(() => {
    setPhase("starting");
    setAttempt((n) => n + 1);
  }, []);

  return {
    phase,
    failureMessage,
    roomId,
    playerName,
    attempt,
    handleCreated,
    handleCreateFailed,
    handlePlayAgain,
    handleRetry,
  };
}
