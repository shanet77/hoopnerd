"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createRoom,
  joinMatchmaking,
  createCpuGame,
  useSocket,
} from "./socket";
import { useAvailableSeasons } from "./useAvailableSeasons";
import { trackEvent } from "./analytics";
import {
  getPlayerName,
  setPlayerName as persistPlayerName,
  setPlayerSession,
} from "./playerSession";

export function useLobbyActions() {
  const { socket, isConnected } = useSocket();
  const router = useRouter();
  const [playerName, setPlayerNameState] = useState<string>(() =>
    getPlayerName(),
  );
  const [feedbackMessage, setFeedbackMessage] = useState<string>("");
  const [isMatchmaking, setIsMatchmaking] = useState(false);
  const [isCpuQueuing, setIsCpuQueuing] = useState(false);
  const { minYear, maxYear, loading: seasonsLoading } = useAvailableSeasons();
  const [seasonYearMin, setSeasonYearMin] = useState<number | undefined>(
    undefined,
  );
  const [seasonYearMax, setSeasonYearMax] = useState<number | undefined>(
    undefined,
  );

  useEffect(() => {
    persistPlayerName(playerName);
  }, [playerName]);

  const handleNameChange = (value: string) => {
    setPlayerNameState(value);
    if (feedbackMessage.includes("name")) {
      setFeedbackMessage("");
    }
  };

  const handleSeasonChange = (
    min: number | undefined,
    max: number | undefined,
  ) => {
    setSeasonYearMin(min);
    setSeasonYearMax(max);
  };

  const requireName = () => {
    if (!playerName) {
      setFeedbackMessage("Please enter your name first.");
      return false;
    }
    return true;
  };

  const requireSocket = () => {
    if (!socket) {
      setFeedbackMessage("Please wait for the connection to be established.");
      return false;
    }
    return true;
  };

  const handleCreateRoom = async (friendsOnly: boolean) => {
    if (!requireSocket() || !requireName()) return;

    try {
      const response = await createRoom(socket!, friendsOnly);
      if (response.success) {
        trackEvent("room_created", {
          mode: friendsOnly ? "friends_only" : "public",
        });
        const query = friendsOnly ? `&friendsOnly=true` : "";
        router.push(
          `/room/${response.roomId}?playerName=${playerName}${query}`,
        );
      } else {
        setFeedbackMessage(`Failed to create room: ${response.message}`);
        trackEvent("room_create_failed", {
          mode: friendsOnly ? "friends_only" : "public",
        });
      }
    } catch (error) {
      console.error("Error creating room:", error);
      setFeedbackMessage("An error occurred while creating the room.");
      trackEvent("room_create_error", {
        mode: friendsOnly ? "friends_only" : "public",
      });
    }
  };

  const handleJoinMatchmaking = async () => {
    if (!requireSocket() || !requireName()) return;

    setIsMatchmaking(true);
    setFeedbackMessage("Searching for a game...");
    trackEvent("matchmaking_started");

    try {
      const response = await joinMatchmaking(socket!, {
        playerName,
        friendsOnly: false,
      });
      if (response.success) {
        trackEvent("matchmaking_joined_room", {
          joined_existing_room: response.joinedExisting,
        });
        if (
          response.roomId &&
          response.playerToken &&
          typeof response.playerId === "number"
        ) {
          setPlayerSession(response.roomId, playerName, {
            token: response.playerToken,
            playerId: response.playerId,
          });
        }
        router.push(`/room/${response.roomId}?playerName=${playerName}`);
      } else {
        setFeedbackMessage(`Matchmaking failed: ${response.message}`);
        trackEvent("matchmaking_failed");
      }
    } catch (error) {
      console.error("Error joining matchmaking:", error);
      setFeedbackMessage("An error occurred during matchmaking.");
      trackEvent("matchmaking_error");
    } finally {
      setIsMatchmaking(false);
    }
  };

  const handleCpuGame = async () => {
    if (!requireSocket() || !requireName()) return;

    setIsCpuQueuing(true);
    setFeedbackMessage("Starting CPU game...");
    const trackProps: Record<string, string | number> = { difficulty: "easy" };
    if (seasonYearMin !== undefined) {
      trackProps.seasonYearMin = seasonYearMin;
    }
    if (seasonYearMax !== undefined) {
      trackProps.seasonYearMax = seasonYearMax;
    }
    trackEvent("cpu_game_started", trackProps);

    try {
      const response = await createCpuGame(socket!, {
        playerName,
        difficulty: "easy",
        seasonYearMin,
        seasonYearMax,
      });
      if (response.success && response.roomId) {
        if (seasonYearMin !== undefined && seasonYearMax !== undefined) {
          trackEvent("cpu_game_created", {
            difficulty: "easy",
            seasonYearMin,
            seasonYearMax,
          });
        } else {
          trackEvent("cpu_game_created", { difficulty: "easy" });
        }
        if (response.playerToken && typeof response.playerId === "number") {
          setPlayerSession(response.roomId, playerName, {
            token: response.playerToken,
            playerId: response.playerId,
          });
        }
        const seasonParam =
          seasonYearMin !== undefined && seasonYearMax !== undefined
            ? `&seasonYearMin=${seasonYearMin}&seasonYearMax=${seasonYearMax}`
            : "";
        router.push(
          `/room/${response.roomId}?playerName=${playerName}&cpuMode=true&cpuDifficulty=easy${seasonParam}`,
        );
      } else {
        setFeedbackMessage(`Failed to start CPU game: ${response.message}`);
        if (seasonYearMin !== undefined && seasonYearMax !== undefined) {
          trackEvent("cpu_game_failed", {
            difficulty: "easy",
            seasonYearMin,
            seasonYearMax,
          });
        } else {
          trackEvent("cpu_game_failed", { difficulty: "easy" });
        }
      }
    } catch (error) {
      console.error("Error starting CPU game:", error);
      setFeedbackMessage("An error occurred while starting CPU game.");
      if (seasonYearMin !== undefined && seasonYearMax !== undefined) {
        trackEvent("cpu_game_error", {
          difficulty: "easy",
          seasonYearMin,
          seasonYearMax,
        });
      } else {
        trackEvent("cpu_game_error", { difficulty: "easy" });
      }
    } finally {
      setIsCpuQueuing(false);
    }
  };

  const handleSoloStreak = () => {
    if (!requireName()) return;
    trackEvent("solo_streak_started", {});
    router.push("/solo");
  };

  const handleJoinRoom = (roomId: string) => {
    if (!roomId || !playerName) {
      setFeedbackMessage("Please enter both a room ID and your name.");
      return;
    }

    if (!socket) {
      setFeedbackMessage("Please wait for the connection to be established.");
      return;
    }

    trackEvent("room_code_join_submitted");
    router.push(`/room/${roomId}?playerName=${playerName}`);
  };

  const actionsDisabled = !isConnected || !playerName;

  return {
    playerName,
    feedbackMessage,
    isMatchmaking,
    isCpuQueuing,
    minYear,
    maxYear,
    seasonsLoading,
    seasonYearMin,
    seasonYearMax,
    actionsDisabled,
    handleNameChange,
    handleSeasonChange,
    handleCreateRoom,
    handleJoinMatchmaking,
    handleCpuGame,
    handleSoloStreak,
    handleJoinRoom,
  };
}
