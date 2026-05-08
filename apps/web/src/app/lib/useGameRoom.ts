"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Socket } from "socket.io-client";
import {
  Player,
  GameRoomState,
  JoinRoomRequest,
  SubmitMoveRequest,
} from "@repo/types";
import {
  joinRoom,
  submitMove,
  leaveRoom,
} from "./socket";
import { trackEvent } from "./analytics";
import {
  clearPlayerSession,
  getPlayerSession,
  setPlayerSession,
} from "./playerSession";

export function useGameRoom(
  socket: Socket | null,
  socketConnected: boolean,
  roomId: string,
  playerName: string,
) {
  const existingSession = getPlayerSession(roomId, playerName);

  const [activePlayer, setActivePlayer] = useState<Player | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(25);
  const [winner, setWinner] = useState<Player | null>(null);
  const [winReason, setWinReason] = useState<string>("");

  const [roomState, setRoomState] = useState<GameRoomState | null>(null);
  const [gameMessage, setGameMessage] = useState<string>("");
  const [isConnected, setIsConnected] = useState(false);
  const [playerToken, setPlayerToken] = useState<string>(
    existingSession?.token ?? "",
  );
  const [myPlayerId, setMyPlayerId] = useState<number | null>(
    existingSession?.playerId ?? null,
  );

  const hasTrackedJoinRef = useRef(false);
  const latestMoveCountRef = useRef(0);

  // Timer countdown
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (roomState?.gameStarted && !roomState.gameCompleted) {
      timer = setInterval(() => {
        setTimeRemaining((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [roomState?.gameStarted, roomState?.gameCompleted]);

  // Track move count for analytics
  useEffect(() => {
    latestMoveCountRef.current = roomState?.moves.length || 0;
  }, [roomState?.moves.length]);

  // Reset join tracking when room/player changes
  useEffect(() => {
    hasTrackedJoinRef.current = false;
  }, [roomId, playerName]);

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    setIsConnected(socketConnected);

    const handleConnect = () => {
      setIsConnected(true);
      if (playerToken) {
        const reconnectRequest: JoinRoomRequest = {
          roomId,
          playerName,
          playerToken,
        };
        joinRoom(socket, reconnectRequest)
          .then((response) => {
            if (response.success) {
              setRoomState(response.roomState || null);
              if (response.roomState?.players?.length) {
                setActivePlayer(
                  response.roomState.players[
                    response.roomState.currentPlayerIndex
                  ],
                );
              }
              trackEvent("room_rejoined", {
                player_count: response.roomState?.players.length || 0,
                game_started: response.roomState?.gameStarted || false,
              });
              if (response.playerToken) {
                setPlayerToken(response.playerToken);
              }
              if (typeof response.playerId === "number") {
                setMyPlayerId(response.playerId);
              }
              if (
                response.playerToken &&
                typeof response.playerId === "number"
              ) {
                setPlayerSession(roomId, playerName, {
                  token: response.playerToken,
                  playerId: response.playerId,
                });
              }
            } else {
              setGameMessage(`Failed to rejoin room: ${response.message}`);
              trackEvent("room_rejoin_failed");
            }
          })
          .catch((error) => {
            console.error("Error rejoining room:", error);
            setGameMessage(
              "Failed to rejoin room. Please refresh and try again.",
            );
            trackEvent("room_rejoin_error");
          });
      }
    };

    const handleDisconnect = () => setIsConnected(false);

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    socket.on("room_updated", (state: GameRoomState) => {
      setRoomState(state);
      if (state.players.length > 0) {
        setActivePlayer(state.players[state.currentPlayerIndex] || null);
      }
    });

    socket.on("game_started", (state: GameRoomState) => {
      setRoomState(state);
      setActivePlayer(state.players[state.currentPlayerIndex]);
      setTimeRemaining(25);
      trackEvent("game_started", {
        player_count: state.players.length,
        friends_only: state.friendsOnly,
      });
    });

    socket.on("turn_changed", (player: Player) => {
      setActivePlayer(player);
      setTimeRemaining(25);
      setGameMessage(`${player.name}'s turn!`);
    });

    socket.on(
      "game_over",
      ({
        winner: gameWinner,
        reason,
      }: {
        winner: Player;
        reason: string;
      }) => {
        setWinner(gameWinner);
        setWinReason(reason);
        setGameMessage(`Game Over! ${gameWinner.name} wins!`);
        trackEvent("game_over", {
          winner_is_me:
            typeof myPlayerId === "number" && gameWinner.id === myPlayerId,
          move_count: latestMoveCountRef.current,
        });
      },
    );

    socket.on("move_submitted", (data) => {
      if (data.roomState) {
        setRoomState(data.roomState);
      }
      setGameMessage(data.message);
    });

    socket.on("player_connected", (player: Player) => {
      setGameMessage(`${player.name} joined the game`);
    });

    socket.on("player_disconnected", (name: string) => {
      setGameMessage(`${name} left the game`);
    });

    socket.on("game_error", (error: string) => {
      setGameMessage(`Error: ${error}`);
    });

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("room_updated");
      socket.off("move_submitted");
      socket.off("player_connected");
      socket.off("player_disconnected");
      socket.off("game_error");
      socket.off("game_started");
      socket.off("turn_changed");
      socket.off("game_over");
    };
  }, [socket, socketConnected, playerToken, roomId, playerName, myPlayerId]);

  // Initial join
  useEffect(() => {
    if (
      socket &&
      socketConnected &&
      roomId &&
      playerName &&
      !playerToken
    ) {
      const requestData: JoinRoomRequest = { roomId, playerName };
      joinRoom(socket, requestData)
        .then((response) => {
          if (response.success) {
            setRoomState(response.roomState || null);
            setGameMessage(response.message);
            if (response.roomState?.players?.length) {
              setActivePlayer(
                response.roomState.players[
                  response.roomState.currentPlayerIndex
                ],
              );
            }
            if (response.playerToken) {
              setPlayerToken(response.playerToken);
            }
            if (typeof response.playerId === "number") {
              setMyPlayerId(response.playerId);
            }
            if (
              response.playerToken &&
              typeof response.playerId === "number"
            ) {
              setPlayerSession(roomId, playerName, {
                token: response.playerToken,
                playerId: response.playerId,
              });
            }
            if (!hasTrackedJoinRef.current) {
              trackEvent("room_joined", {
                player_count: response.roomState?.players.length || 0,
                game_started: response.roomState?.gameStarted || false,
              });
              hasTrackedJoinRef.current = true;
            }
          } else {
            setGameMessage(`Failed to join room: ${response.message}`);
            trackEvent("room_join_failed");
            clearPlayerSession(roomId, playerName);
            setPlayerToken("");
            setMyPlayerId(null);
          }
        })
        .catch((error) => {
          console.error("Error joining room:", error);
          setGameMessage("Failed to join room. Please refresh and try again.");
          trackEvent("room_join_error");
        });
    }
  }, [socket, socketConnected, roomId, playerName, playerToken]);

  const handleSubmitMove = useCallback(
    async (connectedPlayer: Player) => {
      if (!roomState || !socket) {
        setGameMessage(
          "Please select a player to connect and wait for socket connection",
        );
        return { success: false, message: "Not ready" };
      }

      if (!playerToken) {
        setGameMessage("Missing player session token. Please rejoin the room.");
        return { success: false, message: "No token" };
      }

      const moveData: SubmitMoveRequest = {
        roomId: roomState.roomId,
        connectedPlayer,
        playerToken,
      };

      try {
        const response = await submitMove(socket, moveData);

        if (response.success) {
          setGameMessage(response.message);
          trackEvent("move_submitted", {
            move_count:
              response.roomState?.moves.length ||
              latestMoveCountRef.current + 1,
          });
        } else {
          setGameMessage(response.message);
          trackEvent("move_rejected");
        }
        return response;
      } catch (error) {
        console.error("Error submitting move:", error);
        setGameMessage("Error submitting move");
        trackEvent("move_submit_error");
        return { success: false, message: "Error" };
      }
    },
    [roomState, socket, playerToken],
  );

  const handleLeaveRoom = useCallback(() => {
    if (roomState && socket && playerToken) {
      leaveRoom(socket, { roomId: roomState.roomId, playerToken });
    }
    trackEvent("room_left");
    clearPlayerSession(roomId, playerName);
    setPlayerToken("");
    setMyPlayerId(null);
  }, [roomState, socket, playerToken, roomId, playerName]);

  const isMyTurn =
    typeof myPlayerId === "number" && activePlayer?.id === myPlayerId;

  return {
    activePlayer,
    timeRemaining,
    winner,
    winReason,
    roomState,
    gameMessage,
    isConnected,
    playerToken,
    myPlayerId,
    isMyTurn,
    handleSubmitMove,
    handleLeaveRoom,
    setGameMessage,
  };
}
