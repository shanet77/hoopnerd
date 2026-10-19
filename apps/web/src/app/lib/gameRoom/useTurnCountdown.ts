"use client";

import { useEffect, useState } from "react";
import { GameRoomState } from "@repo/types";

export function useTurnCountdown(roomState: GameRoomState | null) {
	const [timeRemaining, setTimeRemaining] = useState<number>(25);

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

	return { timeRemaining, setTimeRemaining };
}
