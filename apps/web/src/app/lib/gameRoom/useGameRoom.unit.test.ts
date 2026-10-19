import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Socket } from "socket.io-client";
import { buildTestPlayer, buildTestRoom } from "@repo/types";
import { joinRoom, leaveRoom, submitMove } from "../socket";
import { trackEvent } from "../analytics";
import {
	clearPlayerSession,
	getPlayerSession,
	setPlayerSession,
} from "../playerSession";
import { useGameRoom } from "./useGameRoom";

vi.mock("../socket", () => ({
	joinRoom: vi.fn(),
	submitMove: vi.fn(),
	leaveRoom: vi.fn(),
}));

vi.mock("../analytics", () => ({
	trackEvent: vi.fn(),
}));

type Handler = (...args: unknown[]) => void;

const createSocket = () => {
	const handlers = new Map<string, Set<Handler>>();
	const socket = {
		on: vi.fn((event: string, handler: Handler) => {
			if (!handlers.has(event)) handlers.set(event, new Set());
			handlers.get(event)?.add(handler);
			return socket;
		}),
		off: vi.fn((event: string, handler: Handler) => {
			handlers.get(event)?.delete(handler);
			return socket;
		}),
		once: vi.fn(),
		emit: vi.fn(),
	};
	const emit = (event: string, payload?: unknown) => {
		handlers.get(event)?.forEach((handler) => handler(payload));
	};
	return { socket: socket as unknown as Socket, emit };
};

const playerOne = buildTestPlayer({ id: 1, name: "Player One" });
const playerTwo = buildTestPlayer({ id: 2, name: "Player Two" });

beforeEach(() => {
	vi.clearAllMocks();
	clearPlayerSession("ROOM1", "Tim Duncan");
	clearPlayerSession("ROOM2", "Tony Parker");
	clearPlayerSession("ROOM3", "Manu Ginobili");
	clearPlayerSession("ROOM4", "Kawhi Leonard");
});

describe("useGameRoom", () => {
	it("joins without a token on first connect and persists the session", async () => {
		const { socket } = createSocket();
		vi.mocked(joinRoom).mockResolvedValue({
			success: true,
			message: "joined",
			roomState: buildTestRoom("ROOM1", {
				players: [playerOne, playerTwo],
			}),
			playerToken: "token-1",
			playerId: 5,
		});

		const { result } = renderHook(() =>
			useGameRoom(socket, true, "ROOM1", "Tim Duncan"),
		);

		await waitFor(() => expect(result.current.playerToken).toBe("token-1"));

		expect(joinRoom).toHaveBeenCalledWith(socket, {
			roomId: "ROOM1",
			playerName: "Tim Duncan",
		});
		expect(result.current.myPlayerId).toBe(5);
		expect(getPlayerSession("ROOM1", "Tim Duncan")).toEqual({
			token: "token-1",
			playerId: 5,
		});
		expect(trackEvent).toHaveBeenCalledWith("room_joined", {
			player_count: 2,
			game_started: false,
		});
	});

	it("rejoins with the stored token when the socket reconnects", async () => {
		const { socket, emit } = createSocket();
		vi.mocked(joinRoom).mockImplementation(async (_socket, data) => {
			if (data.playerToken) {
				return {
					success: true,
					message: "rejoined",
					roomState: buildTestRoom("ROOM2", {
						players: [playerOne, playerTwo],
						gameStarted: true,
					}),
					playerToken: data.playerToken,
					playerId: 9,
				};
			}
			return {
				success: true,
				message: "joined",
				roomState: buildTestRoom("ROOM2", {
					players: [playerOne, playerTwo],
				}),
				playerToken: "token-2",
				playerId: 9,
			};
		});

		const { result } = renderHook(() =>
			useGameRoom(socket, true, "ROOM2", "Tony Parker"),
		);

		await waitFor(() => expect(result.current.playerToken).toBe("token-2"));
		expect(joinRoom).toHaveBeenCalledWith(socket, {
			roomId: "ROOM2",
			playerName: "Tony Parker",
		});

		act(() => emit("connect"));

		await waitFor(() =>
			expect(joinRoom).toHaveBeenCalledWith(socket, {
				roomId: "ROOM2",
				playerName: "Tony Parker",
				playerToken: "token-2",
			}),
		);
		await waitFor(() =>
			expect(result.current.roomState?.gameStarted).toBe(true),
		);
		expect(trackEvent).toHaveBeenCalledWith("room_rejoined", {
			player_count: 2,
			game_started: true,
		});
	});

	it("counts down while the game runs and resets on turn_changed", () => {
		vi.useFakeTimers();
		setPlayerSession("ROOM3", "Manu Ginobili", {
			token: "token-3",
			playerId: 3,
		});
		const { socket, emit } = createSocket();

		const { result } = renderHook(() =>
			useGameRoom(socket, true, "ROOM3", "Manu Ginobili"),
		);

		act(() =>
			emit(
				"game_started",
				buildTestRoom("ROOM3", {
					players: [playerOne, playerTwo],
					gameStarted: true,
				}),
			),
		);
		expect(result.current.timeRemaining).toBe(25);

		act(() => vi.advanceTimersByTime(3000));
		expect(result.current.timeRemaining).toBe(22);

		act(() => emit("turn_changed", playerTwo));
		expect(result.current.timeRemaining).toBe(25);

		act(() => vi.advanceTimersByTime(1000));
		expect(result.current.timeRemaining).toBe(24);

		vi.useRealTimers();
	});

	it("leaves the room and clears the stored session", () => {
		setPlayerSession("ROOM4", "Kawhi Leonard", {
			token: "token-4",
			playerId: 4,
		});
		const { socket, emit } = createSocket();

		const { result } = renderHook(() =>
			useGameRoom(socket, false, "ROOM4", "Kawhi Leonard"),
		);

		act(() => emit("room_updated", buildTestRoom("ROOM4", { players: [playerOne] })));
		act(() => result.current.handleLeaveRoom());

		expect(leaveRoom).toHaveBeenCalledWith(socket, {
			roomId: "ROOM4",
			playerToken: "token-4",
		});
		expect(result.current.playerToken).toBe("");
		expect(result.current.myPlayerId).toBeNull();
		expect(getPlayerSession("ROOM4", "Kawhi Leonard")).toBeUndefined();
		expect(trackEvent).toHaveBeenCalledWith("room_left");
	});

	it("submits a move with the session token and tracks it", async () => {
		setPlayerSession("ROOM1", "Tim Duncan", {
			token: "token-1",
			playerId: 5,
		});
		const { socket, emit } = createSocket();
		vi.mocked(submitMove).mockResolvedValue({
			success: true,
			message: "move accepted",
			validated: true,
			roomState: buildTestRoom("ROOM1", {
				players: [playerOne, playerTwo],
				moves: [{ playerId: 1, playerName: "Player One", position: "G" }],
			}),
		});

		const { result } = renderHook(() =>
			useGameRoom(socket, false, "ROOM1", "Tim Duncan"),
		);
		act(() => emit("room_updated", buildTestRoom("ROOM1", { players: [playerOne] })));

		await act(async () => {
			await result.current.handleSubmitMove(playerTwo);
		});

		expect(submitMove).toHaveBeenCalledWith(socket, {
			roomId: "ROOM1",
			connectedPlayer: playerTwo,
			playerToken: "token-1",
		});
		expect(trackEvent).toHaveBeenCalledWith("move_submitted", {
			move_count: 1,
		});
	});
});
