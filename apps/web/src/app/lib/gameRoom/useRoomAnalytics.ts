"use client";

import { useCallback, useEffect, useRef } from "react";
import { GameRoomState } from "@repo/types";
import { trackEvent } from "../analytics";

export function useRoomAnalytics(
	roomId: string,
	playerName: string,
	roomState: GameRoomState | null,
) {
	const hasTrackedJoinRef = useRef(false);
	const latestMoveCountRef = useRef(0);

	// Track move count for analytics
	useEffect(() => {
		latestMoveCountRef.current = roomState?.moves.length || 0;
	}, [roomState?.moves.length]);

	// Reset join tracking when room/player changes
	useEffect(() => {
		hasTrackedJoinRef.current = false;
	}, [roomId, playerName]);

	const trackRoomJoined = useCallback(
		(playerCount: number, gameStarted: boolean) => {
			if (hasTrackedJoinRef.current) return;
			trackEvent("room_joined", {
				player_count: playerCount,
				game_started: gameStarted,
			});
			hasTrackedJoinRef.current = true;
		},
		[],
	);

	const trackRoomRejoined = useCallback(
		(playerCount: number, gameStarted: boolean) => {
			trackEvent("room_rejoined", {
				player_count: playerCount,
				game_started: gameStarted,
			});
		},
		[],
	);

	const trackRoomJoinFailed = useCallback(() => {
		trackEvent("room_join_failed");
	}, []);

	const trackRoomJoinError = useCallback(() => {
		trackEvent("room_join_error");
	}, []);

	const trackRoomRejoinFailed = useCallback(() => {
		trackEvent("room_rejoin_failed");
	}, []);

	const trackRoomRejoinError = useCallback(() => {
		trackEvent("room_rejoin_error");
	}, []);

	const trackGameStarted = useCallback(
		(playerCount: number, friendsOnly: boolean) => {
			trackEvent("game_started", {
				player_count: playerCount,
				friends_only: friendsOnly,
			});
		},
		[],
	);

	const trackGameOver = useCallback((winnerIsMe: boolean) => {
		trackEvent("game_over", {
			winner_is_me: winnerIsMe,
			move_count: latestMoveCountRef.current,
		});
	}, []);

	const trackMoveSubmitted = useCallback((moveCount: number) => {
		trackEvent("move_submitted", {
			move_count: moveCount,
		});
	}, []);

	const trackMoveRejected = useCallback(() => {
		trackEvent("move_rejected");
	}, []);

	const trackMoveSubmitError = useCallback(() => {
		trackEvent("move_submit_error");
	}, []);

	const trackRoomLeft = useCallback(() => {
		trackEvent("room_left");
	}, []);

	return {
		latestMoveCountRef,
		trackRoomJoined,
		trackRoomRejoined,
		trackRoomJoinFailed,
		trackRoomJoinError,
		trackRoomRejoinFailed,
		trackRoomRejoinError,
		trackGameStarted,
		trackGameOver,
		trackMoveSubmitted,
		trackMoveRejected,
		trackMoveSubmitError,
		trackRoomLeft,
	};
}
