"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Socket } from "socket.io-client";
import type {
  EndSoloRunResponse,
  Player,
  SoloEndReason,
  SoloRunState,
  SubmitSoloMoveResponse,
} from "@repo/types";
import {
  createSoloRun,
  endSoloRun,
  resumeSoloRun,
  submitSoloMove,
} from "./socket";
import { trackEvent } from "./analytics";
import {
  clearStoredSoloRun,
  getSoloBest,
  getStoredSoloRun,
  getUserId,
  setSoloBest,
  setStoredSoloRun,
} from "./userIdentity";

export type SoloEndInfo = {
  streak: number;
  endReason?: SoloEndReason;
  personalBest: number;
  isNewBest: boolean;
  message: string;
};

type ActiveSoloRun = {
  runId: string;
  runToken: string;
};

export function useSoloRun(
  socket: Socket | null,
  socketConnected: boolean,
  displayName: string,
) {
  const [runState, setRunState] = useState<SoloRunState | null>(null);
  const [gameMessage, setGameMessage] = useState("");
  const [personalBest, setPersonalBest] = useState(0);
  const [endInfo, setEndInfo] = useState<SoloEndInfo | null>(null);
  const [isStarting, setIsStarting] = useState(true);
  const [runNonce, setRunNonce] = useState(0);

  const userIdRef = useRef("");
  const activeRunRef = useRef<ActiveSoloRun | null>(null);
  const runEndedRef = useRef(false);
  const bootstrapKeyRef = useRef("");

  useEffect(() => {
    userIdRef.current = getUserId();
    setPersonalBest(getSoloBest());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !userIdRef.current) return;
    const apiHost = process.env.NEXT_PUBLIC_API_HOST || "http://localhost:3001";
    fetch(
      `${apiHost}/api/solo/best?userId=${encodeURIComponent(userIdRef.current)}`,
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { bestStreak: number } | null) => {
        if (!payload) return;
        if (payload.bestStreak > getSoloBest()) {
          setSoloBest(payload.bestStreak);
          setPersonalBest(payload.bestStreak);
        }
      })
      .catch(() => {});
  }, []);

  const applyEnd = useCallback((info: SoloEndInfo) => {
    runEndedRef.current = true;
    clearStoredSoloRun();
    setEndInfo(info);
    setPersonalBest((previous) => {
      const next = Math.max(previous, info.personalBest);
      if (next !== previous) {
        setSoloBest(next);
      }
      return next;
    });
    setRunState((previous) =>
      previous
        ? {
            ...previous,
            gameCompleted: true,
            endReason: info.endReason,
          }
        : previous,
    );
  }, []);

  const handleMoveResponse = useCallback(
    (response: SubmitSoloMoveResponse) => {
      setGameMessage(response.message);
      if (response.success && response.move) {
        const move = response.move;
        setRunState((previous) => {
          if (!previous) return previous;
          return {
            ...previous,
            moves: [...previous.moves, move],
            connections: response.connection
              ? [...previous.connections, response.connection]
              : previous.connections,
            lastConnectedPlayer: {
              id: move.playerId,
              name: move.playerName,
              position: move.position,
            },
          };
        });
        trackEvent("solo_move_accepted", {
          streak: response.streak ?? 0,
        });
      }

      if (response.ended) {
        applyEnd({
          streak: response.streak ?? 0,
          endReason: response.endReason,
          personalBest: response.personalBest ?? getSoloBest(),
          isNewBest: response.isNewBest ?? false,
          message: response.message,
        });
        trackEvent("solo_run_ended", {
          end_reason: response.endReason ?? "unknown",
          streak: response.streak ?? 0,
        });
      } else if (!response.success) {
        trackEvent("solo_move_rejected");
      }
    },
    [applyEnd],
  );

  const handleEndResponse = useCallback(
    (response: EndSoloRunResponse) => {
      if (response.success) {
        applyEnd({
          streak: response.streak,
          endReason: response.endReason,
          personalBest: response.personalBest ?? getSoloBest(),
          isNewBest: response.isNewBest ?? false,
          message: response.message,
        });
      } else {
        setGameMessage(response.message);
      }
    },
    [applyEnd],
  );

  useEffect(() => {
    if (!socket || !socketConnected || !displayName) return;

    const bootstrapKey = `${socket.id}|${runNonce}`;
    if (bootstrapKeyRef.current === bootstrapKey) return;
    bootstrapKeyRef.current = bootstrapKey;
    let cancelled = false;

    const startNewRun = async () => {
      const response = await createSoloRun(socket, {
        userId: userIdRef.current,
        displayName,
      });
      if (cancelled) return;
      if (response.success && response.runState && response.runToken) {
        activeRunRef.current = {
          runId: response.runState.roomId,
          runToken: response.runToken,
        };
        runEndedRef.current = false;
        setStoredSoloRun(activeRunRef.current);
        setRunState(response.runState);
        setEndInfo(null);
        setGameMessage(response.message);
        trackEvent("solo_run_created", {});
      } else {
        setGameMessage(response.message);
      }
      setIsStarting(false);
    };

    const stored = getStoredSoloRun();
    if (!stored) {
      startNewRun().catch(() => {
        if (!cancelled) {
          setGameMessage(
            "Failed to start run. Check your connection and retry.",
          );
          setIsStarting(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    resumeSoloRun(socket, stored)
      .then((response) => {
        if (cancelled) return;
        if (response.success && response.runState) {
          activeRunRef.current = stored;
          runEndedRef.current = false;
          setRunState(response.runState);
          setEndInfo(null);
          setGameMessage(response.message);
          trackEvent("solo_run_resumed", {
            move_count: response.runState.moves.length,
          });
          setIsStarting(false);
          return;
        }
        clearStoredSoloRun();
        return startNewRun();
      })
      .catch(() => {
        if (cancelled) return;
        clearStoredSoloRun();
        return startNewRun();
      });

    return () => {
      cancelled = true;
    };
  }, [socket, socketConnected, displayName, runNonce]);

  useEffect(() => {
    if (!socket) return;
    const handleReconnect = () => {
      const active = activeRunRef.current;
      if (!active || runEndedRef.current) return;
      resumeSoloRun(socket, active)
        .then((response) => {
          if (response.success && response.runState) {
            setRunState(response.runState);
          }
        })
        .catch(() => {});
    };
    socket.on("connect", handleReconnect);
    return () => {
      socket.off("connect", handleReconnect);
    };
  }, [socket]);

  const handleSubmitMove = useCallback(
    async (connectedPlayer: Player): Promise<{ success: boolean }> => {
      const active = activeRunRef.current;
      if (!socket || !active || !runState || runState.gameCompleted) {
        setGameMessage("Run not active.");
        return { success: false };
      }
      try {
        const response = await submitSoloMove(socket, {
          runId: active.runId,
          runToken: active.runToken,
          connectedPlayer,
        });
        handleMoveResponse(response);
        return { success: response.success };
      } catch (error) {
        console.error("Error submitting solo move:", error);
        setGameMessage("Error submitting move");
        return { success: false };
      }
    },
    [socket, runState, handleMoveResponse],
  );

  const handleEndRun = useCallback(async () => {
    const active = activeRunRef.current;
    if (!socket || !active || runEndedRef.current) return;
    try {
      const response = await endSoloRun(socket, {
        runId: active.runId,
        runToken: active.runToken,
      });
      handleEndResponse(response);
      trackEvent("solo_run_forfeited", { streak: response.streak });
    } catch (error) {
      console.error("Error ending solo run:", error);
      setGameMessage("Error ending run");
    }
  }, [socket, handleEndResponse]);

  const handleNewRun = useCallback(() => {
    clearStoredSoloRun();
    activeRunRef.current = null;
    runEndedRef.current = false;
    bootstrapKeyRef.current = "";
    setRunState(null);
    setEndInfo(null);
    setGameMessage("");
    setIsStarting(true);
    setRunNonce((nonce) => nonce + 1);
  }, []);

  return {
    runState,
    gameMessage,
    personalBest,
    endInfo,
    isStarting,
    handleSubmitMove,
    handleEndRun,
    handleNewRun,
    setGameMessage,
  };
}
