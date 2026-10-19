"use client";

import { useCallback } from "react";
import { Socket } from "socket.io-client";
import { GameRoomState, Player, SubmitMoveRequest } from "@repo/types";
import { leaveRoom, submitMove } from "../socket";
import { clearPlayerSession } from "../playerSession";
import { useRoomAnalytics } from "./useRoomAnalytics";

type RoomAnalytics = ReturnType<typeof useRoomAnalytics>;

type MoveSubmissionOptions = {
	socket: Socket | null;
	roomState: GameRoomState | null;
	playerToken: string;
	roomId: string;
	playerName: string;
	setGameMessage: (message: string) => void;
	setPlayerToken: (token: string) => void;
	setMyPlayerId: (playerId: number | null) => void;
	analytics: RoomAnalytics;
};

export function useMoveSubmission({
	socket,
	roomState,
	playerToken,
	roomId,
	playerName,
	setGameMessage,
	setPlayerToken,
	setMyPlayerId,
	analytics,
}: MoveSubmissionOptions) {
	const {
		latestMoveCountRef,
		trackMoveSubmitted,
		trackMoveRejected,
		trackMoveSubmitError,
		trackRoomLeft,
	} = analytics;

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
					trackMoveSubmitted(
						response.roomState?.moves.length ||
							latestMoveCountRef.current + 1,
					);
				} else {
					setGameMessage(response.message);
					trackMoveRejected();
				}
				return response;
			} catch (error) {
				console.error("Error submitting move:", error);
				setGameMessage("Error submitting move");
				trackMoveSubmitError();
				return { success: false, message: "Error" };
			}
		},
		[roomState, socket, playerToken],
	);

	const handleLeaveRoom = useCallback(() => {
		if (roomState && socket && playerToken) {
			leaveRoom(socket, { roomId: roomState.roomId, playerToken });
		}
		trackRoomLeft();
		clearPlayerSession(roomId, playerName);
		setPlayerToken("");
		setMyPlayerId(null);
	}, [roomState, socket, playerToken, roomId, playerName]);

	return { handleSubmitMove, handleLeaveRoom };
}
