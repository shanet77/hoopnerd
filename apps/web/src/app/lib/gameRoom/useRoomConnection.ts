"use client";

import { useEffect, useState } from "react";
import { Socket } from "socket.io-client";
import { Player, GameRoomState, JoinRoomRequest } from "@repo/types";
import { joinRoom } from "../socket";
import {
	clearPlayerSession,
	getPlayerSession,
	setPlayerSession,
} from "../playerSession";
import { useRoomAnalytics } from "./useRoomAnalytics";

type RoomAnalytics = ReturnType<typeof useRoomAnalytics>;

type RoomConnectionOptions = {
	socket: Socket | null;
	socketConnected: boolean;
	roomId: string;
	playerName: string;
	setRoomState: (state: GameRoomState | null) => void;
	setActivePlayer: (player: Player | null) => void;
	setGameMessage: (message: string) => void;
	setTimeRemaining: (seconds: number) => void;
	setCpuThinking: (thinking: boolean) => void;
	setWinner: (player: Player) => void;
	setWinReason: (reason: string) => void;
	analytics: RoomAnalytics;
};

export function useRoomConnection({
	socket,
	socketConnected,
	roomId,
	playerName,
	setRoomState,
	setActivePlayer,
	setGameMessage,
	setTimeRemaining,
	setCpuThinking,
	setWinner,
	setWinReason,
	analytics,
}: RoomConnectionOptions) {
	const existingSession = getPlayerSession(roomId, playerName);

	const [playerToken, setPlayerToken] = useState<string>(
		existingSession?.token ?? "",
	);
	const [myPlayerId, setMyPlayerId] = useState<number | null>(
		existingSession?.playerId ?? null,
	);
	const [isConnected, setIsConnected] = useState(false);

	const {
		trackRoomJoined,
		trackRoomRejoined,
		trackRoomJoinFailed,
		trackRoomJoinError,
		trackRoomRejoinFailed,
		trackRoomRejoinError,
		trackGameStarted,
		trackGameOver,
	} = analytics;

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
							trackRoomRejoined(
								response.roomState?.players.length || 0,
								response.roomState?.gameStarted || false,
							);
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
							trackRoomRejoinFailed();
						}
					})
					.catch((error) => {
						console.error("Error rejoining room:", error);
						setGameMessage(
							"Failed to rejoin room. Please refresh and try again.",
						);
						trackRoomRejoinError();
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
			setCpuThinking(false);
			trackGameStarted(state.players.length, state.friendsOnly);
		});

		socket.on("turn_changed", (player: Player) => {
			setActivePlayer(player);
			setTimeRemaining(25);
			setCpuThinking(false);
			if (player.isCpu) {
				// CPU's turn — cpu_thinking event will fire shortly
			} else {
				setGameMessage(`${player.name}'s turn!`);
			}
		});

		socket.on("cpu_thinking", () => {
			setCpuThinking(true);
			setGameMessage("BronBot is thinking...");
		});

		socket.on(
			"game_over",
			({ winner: gameWinner, reason }: { winner: Player; reason: string }) => {
				setWinner(gameWinner);
				setWinReason(reason);
				setCpuThinking(false);
				setGameMessage(`Game Over! ${gameWinner.name} wins!`);
				trackGameOver(
					typeof myPlayerId === "number" && gameWinner.id === myPlayerId,
				);
			},
		);

		socket.on("move_submitted", (data) => {
			if (data.roomState) {
				setRoomState(data.roomState);
			}
			setCpuThinking(false);
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
			socket.off("cpu_thinking");
			socket.off("game_over");
		};
	}, [socket, socketConnected, playerToken, roomId, playerName, myPlayerId]);

	// Initial join
	useEffect(() => {
		if (socket && socketConnected && roomId && playerName && !playerToken) {
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
						if (response.playerToken && typeof response.playerId === "number") {
							setPlayerSession(roomId, playerName, {
								token: response.playerToken,
								playerId: response.playerId,
							});
						}
						trackRoomJoined(
							response.roomState?.players.length || 0,
							response.roomState?.gameStarted || false,
						);
					} else {
						setGameMessage(`Failed to join room: ${response.message}`);
						trackRoomJoinFailed();
						clearPlayerSession(roomId, playerName);
						setPlayerToken("");
						setMyPlayerId(null);
					}
				})
				.catch((error) => {
					console.error("Error joining room:", error);
					setGameMessage("Failed to join room. Please refresh and try again.");
					trackRoomJoinError();
				});
		}
	}, [socket, socketConnected, roomId, playerName, playerToken]);

	return {
		playerToken,
		myPlayerId,
		isConnected,
		setPlayerToken,
		setMyPlayerId,
	};
}
