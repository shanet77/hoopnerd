"use client";

import { useState, useEffect, FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Card, CardContent } from "@repo/ui/card";
import { LeaderboardList } from "@repo/ui/leaderboard-list";
import { FeedbackBanner } from "@repo/ui/feedback-banner";
import {
	SocketProvider,
	useSocket,
	createRoom,
	joinMatchmaking,
	createCpuGame,
} from "./lib/socket";
import { useLobbyStats } from "./lib/useLobbyStats";
import { useAvailableSeasons } from "./lib/useAvailableSeasons";
import { trackEvent } from "./lib/analytics";
import { getPlayerName, setPlayerName, setPlayerSession } from "./lib/playerSession";
import ClientOnly from "../components/ClientOnly";
import { LobbyActionCard } from "../components/lobby/LobbyActionCard";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";

export default function Web() {
	return (
		<ClientOnly>
			<SocketProviderWrapper />
		</ClientOnly>
	);
}

function SocketProviderWrapper() {
	return (
		<SocketProvider>
			<LobbyPage />
		</SocketProvider>
	);
}

function LobbyPage() {
	const { socket, isConnected } = useSocket();
	const [roomId, setRoomId] = useState<string>("");
	const [playerName, setPlayerNameState] = useState<string>(() => getPlayerName());
	const [feedbackMessage, setFeedbackMessage] = useState<string>("");
	const [isMatchmaking, setIsMatchmaking] = useState(false);
	const [isCpuQueuing, setIsCpuQueuing] = useState(false);
	const { stats, error: statsError } = useLobbyStats();
	const { minYear, maxYear, loading: seasonsLoading } = useAvailableSeasons();
	const [selectedSeason, setSelectedSeason] = useState<number | undefined>(
		undefined,
	);
	const router = useRouter();

	useEffect(() => {
		setPlayerName(playerName);
	}, [playerName]);

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
		if (selectedSeason !== undefined) {
			trackProps.seasonYear = selectedSeason;
		}
		trackEvent("cpu_game_started", trackProps);

		try {
			const response = await createCpuGame(socket!, {
				playerName,
				difficulty: "easy",
				seasonYear: selectedSeason,
			});
			if (response.success && response.roomId) {
				if (selectedSeason !== undefined) {
					trackEvent("cpu_game_created", {
						difficulty: "easy",
						seasonYear: selectedSeason,
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
					selectedSeason !== undefined
						? `&seasonYear=${selectedSeason}`
						: "";
				router.push(
					`/room/${response.roomId}?playerName=${playerName}&cpuMode=true&cpuDifficulty=easy${seasonParam}`,
				);
			} else {
				setFeedbackMessage(`Failed to start CPU game: ${response.message}`);
				if (selectedSeason !== undefined) {
					trackEvent("cpu_game_failed", {
						difficulty: "easy",
						seasonYear: selectedSeason,
					});
				} else {
					trackEvent("cpu_game_failed", { difficulty: "easy" });
				}
			}
		} catch (error) {
			console.error("Error starting CPU game:", error);
			setFeedbackMessage("An error occurred while starting CPU game.");
			if (selectedSeason !== undefined) {
				trackEvent("cpu_game_error", {
					difficulty: "easy",
					seasonYear: selectedSeason,
				});
			} else {
				trackEvent("cpu_game_error", { difficulty: "easy" });
			}
		} finally {
			setIsCpuQueuing(false);
		}
	};

	const handleJoinRoom = (e: FormEvent) => {
		e.preventDefault();

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

	const nameMissing = !playerName;

	return (
		<main id="main-content" className="min-h-screen bg-gray-50 py-8 px-4">
			<div className="max-w-5xl mx-auto space-y-6">
				<div className="text-center space-y-2">
					<h1 className="font-title text-4xl font-bold text-gray-800 tracking-tight">
						HoopNerd
					</h1>
					<p className="text-gray-500 font-medium">Who played with who?</p>
					<p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
						Alpha • v{APP_VERSION}
					</p>
				</div>

				<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
					<div className="space-y-6">
						{feedbackMessage && (
							<FeedbackBanner variant="warning">
								{feedbackMessage}
							</FeedbackBanner>
						)}

						<LobbyActionCard
							title="Who's Playing?"
							description="Enter your name to get started"
							connected={isConnected}
						>
							<Input
								id="playerName"
								label="Your name"
								value={playerName}
								onChange={(e) => {
									setPlayerNameState(e.target.value);
									if (feedbackMessage.includes("name")) {
										setFeedbackMessage("");
									}
								}}
								placeholder="King James, Black Mamba, Chef Curry..."
								className="text-sm text-gray-600"
								autoFocus
							/>
							{nameMissing && (
								<p className="mt-2 text-xs text-gray-400 font-medium text-center">
									Enter your name to unlock game actions
								</p>
							)}
						</LobbyActionCard>

						<LobbyActionCard
							title="Quick Play"
							description="Get matched with a random player"
							variant="highlight"
						>
							<Button
								onClick={handleJoinMatchmaking}
								disabled={!isConnected || isMatchmaking || !playerName}
								variant="success"
								className="w-full"
							>
								{isMatchmaking ? "🔍 Searching..." : "Find Match"}
							</Button>
						</LobbyActionCard>

						<LobbyActionCard
							title="Play vs CPU"
							description="Practice against the CPU"
						>
							<div className="mb-4">
								<label
									htmlFor="season-input"
									className="mb-2 text-sm font-bold text-gray-700 uppercase tracking-wide block"
								>
									Season
									{minYear && maxYear && (
										<span className="ml-1 text-xs font-normal text-gray-400 lowercase normal-case tracking-normal">
											({minYear}–{maxYear})
										</span>
									)}
								</label>
								<input
									id="season-input"
									type="number"
									min={minYear}
									max={maxYear}
									value={selectedSeason ?? ""}
									onChange={(e) => {
										const val = e.target.value;
										setSelectedSeason(
											val === "" ? undefined : Number(val),
										);
									}}
									disabled={seasonsLoading}
									placeholder="All Seasons"
									className={`
										w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl
										text-gray-800 text-base transition-all duration-200
										shadow-[inset_0_2px_4px_rgba(0,0,0,0.04)]
										placeholder:text-gray-400
										focus:border-brand-400 focus:bg-white focus:outline-none
										focus-visible:ring-4 focus-visible:ring-brand-300 focus-visible:ring-offset-1
										focus:shadow-[0_0_0_4px_rgba(14,165,233,0.15),inset_0_2px_4px_rgba(0,0,0,0.04)]
										disabled:bg-gray-100 disabled:cursor-not-allowed
									`}
								/>
							</div>
							<Button
								onClick={handleCpuGame}
								disabled={!isConnected || isCpuQueuing || !playerName}
								variant="primary"
								className="w-full"
							>
								{isCpuQueuing ? "Starting..." : "Play vs CPU"}
							</Button>
						</LobbyActionCard>

						<LobbyActionCard
							title="Play with Friends"
							description="Create a private room and share the code"
						>
							<Button
								onClick={() => handleCreateRoom(true)}
								disabled={!isConnected || !playerName}
								variant="primary"
								className="w-full"
							>
								Create Room
							</Button>
						</LobbyActionCard>

						<LobbyActionCard
							title="Join with Code"
							description="Enter a room code from a friend"
						>
							<form onSubmit={handleJoinRoom} className="space-y-4">
								<Input
									id="roomId"
									label="Room Code"
									value={roomId}
									onChange={(e) => setRoomId(e.target.value)}
									placeholder="e.g., ABC123"
								/>
								<Button
									type="submit"
									disabled={!isConnected || !playerName}
									variant="secondary"
									className="w-full"
								>
									Join Room
								</Button>
							</form>
						</LobbyActionCard>

						<div className="text-center pt-4">
							<p className="text-xs text-gray-400 font-medium">
								How to play: Connect players who played together on the same
								team in the same season!
							</p>
						</div>
					</div>

					<div className="space-y-6">
						<Card hover className="bg-white border-2 border-gray-200">
							<CardContent className="space-y-4 text-sm text-gray-600">
								<div className="text-center">
									<div className="inline-flex items-center justify-center w-12 h-12 bg-success-light rounded-2xl mx-auto mb-2 shadow-[0_4px_0_rgba(88,204,2,0.25)]">
										<Image
											src="/larry_obrien.svg"
											alt="Larry O'Brien Trophy"
											width={28}
											height={28}
											className="h-7 w-7 object-contain"
										/>
									</div>
									<h2 className="font-title text-xl font-bold text-gray-800">
										Weekly Leaderboard
									</h2>
									<p className="text-gray-500 text-sm">
										Last 7 days • Top 5 only
									</p>
								</div>

								{!stats && !statsError && (
									<p
										className="text-center text-gray-400"
										role="status"
										aria-live="polite"
									>
										Loading stats...
									</p>
								)}
								{!stats && statsError && (
									<p className="text-center text-amber-600" role="alert">
										Stats currently unavailable.
									</p>
								)}

								{stats && (
									<div className="space-y-4">
										<div className="flex items-center justify-between rounded-2xl border-2 border-success/20 bg-success-light/40 px-4 py-3">
											<div>
												<p className="text-xs font-bold uppercase tracking-wide text-success-dark">
													Longest Streak
												</p>
												<p className="text-lg font-bold text-gray-800">
													{stats.longestStreak} connections
												</p>
											</div>
											<div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl shadow-sm">
												🔥
											</div>
										</div>

										<LeaderboardList
											title="Players"
											badge="Top 5"
											items={stats.players.slice(0, 5).map((p) => ({
												label: p.name,
												value: p.count,
											}))}
										/>
										<LeaderboardList
											title="Teams"
											badge="Top 5"
											items={stats.teams.slice(0, 5).map((t) => ({
												label: t.name,
												value: t.count,
											}))}
										/>
										<LeaderboardList
											title="Seasons"
											badge="Top 5"
											items={stats.seasons.slice(0, 5).map((s) => ({
												label: String(s.seasonYear),
												value: s.count,
											}))}
										/>

										<p className="text-center text-xs text-gray-400">
											Updated {new Date(stats.updatedAt).toLocaleString()}
										</p>
									</div>
								)}
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		</main>
	);
}
