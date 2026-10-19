"use client";

import { useState } from "react";
import { Socket } from "socket.io-client";
import { Player, GameRoomState } from "@repo/types";
import { useRoomConnection } from "./useRoomConnection";
import { useTurnCountdown } from "./useTurnCountdown";
import { useRoomAnalytics } from "./useRoomAnalytics";
import { useMoveSubmission } from "./useMoveSubmission";

export function useGameRoom(
	socket: Socket | null,
	socketConnected: boolean,
	roomId: string,
	playerName: string,
) {
	const [activePlayer, setActivePlayer] = useState<Player | null>(null);
	const [winner, setWinner] = useState<Player | null>(null);
	const [winReason, setWinReason] = useState<string>("");
	const [cpuThinking, setCpuThinking] = useState(false);

	const [roomState, setRoomState] = useState<GameRoomState | null>(null);
	const [gameMessage, setGameMessage] = useState<string>("");

	const { timeRemaining, setTimeRemaining } = useTurnCountdown(roomState);

	const analytics = useRoomAnalytics(roomId, playerName, roomState);

	const { playerToken, myPlayerId, isConnected, setPlayerToken, setMyPlayerId } =
		useRoomConnection({
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
		});

	const { handleSubmitMove, handleLeaveRoom } = useMoveSubmission({
		socket,
		roomState,
		playerToken,
		roomId,
		playerName,
		setGameMessage,
		setPlayerToken,
		setMyPlayerId,
		analytics,
	});

	// Determine if opponent is CPU
	const isCpuOpponent = roomState?.players.some((p) => p.isCpu) ?? false;

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
		isCpuOpponent,
		cpuThinking,
		handleSubmitMove,
		handleLeaveRoom,
		setGameMessage,
	};
}
