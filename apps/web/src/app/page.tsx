"use client";

import { useState, useEffect, FormEvent } from "react";
import Image from "next/image";
import { LoaderCircle, Flame } from "lucide-react";
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
import { ThemeToggle } from "../components/ThemeToggle";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";

const SEASON_PRESETS = [
	{ label: "All Time", min: undefined, max: undefined },
	{ label: "80s", min: 1980, max: 1989 },
	{ label: "90s", min: 1990, max: 1999 },
	{ label: "2000s", min: 2000, max: 2009 },
	{ label: "2010s", min: 2010, max: 2019 },
	{ label: "2020s", min: 2020, max: 2026 },
];

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
	const { seasons, minYear, maxYear, loading: seasonsLoading } = useAvailableSeasons();
	const [seasonYearMin, setSeasonYearMin] = useState<number | undefined>(
		undefined,
	);
	const [seasonYearMax, setSeasonYearMax] = useState<number | undefined>(
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
		<main id="main-content" className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
			<div className="max-w-5xl mx-auto space-y-6">
				<div className="text-center space-y-2">
					<div className="flex items-center justify-center gap-4">
						<h1 className="font-title text-4xl font-bold text-gray-800 dark:text-gray-100 tracking-tight">
							HoopNerd
						</h1>
						<ThemeToggle />
					</div>
					<p className="text-gray-500 dark:text-gray-400 font-medium">Who played with who?</p>
					<p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
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
								className="text-sm text-gray-600 dark:text-gray-300"
								autoFocus
							/>
							{nameMissing && (
								<p className="mt-2 text-xs text-gray-400 dark:text-gray-500 font-medium text-center">
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
								{isMatchmaking ? <span className="inline-flex items-center gap-2"><LoaderCircle className="h-5 w-5 animate-spin" />Searching...</span> : "Find Match"}
							</Button>
						</LobbyActionCard>

						<LobbyActionCard
							title="Play vs CPU"
							description="Practice against the CPU"
						>
							<div className="mb-4 space-y-3">
								<label className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide block">
									Season
									{minYear && maxYear && (
										<span className="ml-1 text-xs font-normal text-gray-400 dark:text-gray-500 lowercase normal-case tracking-normal">
											({minYear}–{maxYear})
										</span>
									)}
								</label>
								<div className="flex flex-wrap gap-1.5">
									{SEASON_PRESETS.map((preset) => {
										const isActive =
											seasonYearMin === preset.min &&
											seasonYearMax === preset.max;
										return (
											<button
												key={preset.label}
												type="button"
												onClick={() => {
													setSeasonYearMin(preset.min);
													setSeasonYearMax(preset.max);
												}}
												disabled={seasonsLoading}
												className={`
													px-3 py-1.5 text-xs font-bold rounded-full border-2 transition-all duration-150
													${isActive
														? "bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 border-brand-300"
														: "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-200"
													}
													disabled:opacity-40 disabled:cursor-not-allowed
												`}
											>
												{preset.label}
											</button>
										);
									})}
								</div>
								<div className="flex gap-2 items-center">
									<input
										id="season-year-min"
										type="number"
										min={minYear}
										max={maxYear}
										value={seasonYearMin ?? ""}
										onChange={(e) => {
											const val = e.target.value;
											setSeasonYearMin(val === "" ? undefined : Number(val));
										}}
										disabled={seasonsLoading}
										placeholder="From"
										className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-gray-800 dark:text-gray-100 text-sm transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-brand-400 dark:focus:border-brand-500 focus:bg-white dark:focus:bg-gray-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-300 dark:focus-visible:ring-brand-700 focus-visible:ring-offset-1 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
									/>
									<span className="text-gray-400 dark:text-gray-500 font-bold text-sm">–</span>
									<input
										id="season-year-max"
										type="number"
										min={minYear}
										max={maxYear}
										value={seasonYearMax ?? ""}
										onChange={(e) => {
											const val = e.target.value;
											setSeasonYearMax(val === "" ? undefined : Number(val));
										}}
										disabled={seasonsLoading}
										placeholder="To"
										className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-gray-800 dark:text-gray-100 text-sm transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-brand-400 dark:focus:border-brand-500 focus:bg-white dark:focus:bg-gray-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-300 dark:focus-visible:ring-brand-700 focus-visible:ring-offset-1 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
									/>
								</div>
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
							<p className="text-xs text-gray-400 dark:text-gray-500 font-medium">
								How to play: Connect players who played together on the same
								team in the same season.
							</p>
						</div>
					</div>

					<div className="space-y-6">
						<Card hover className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700">
							<CardContent className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
								<div className="text-center">
									<div className="inline-flex items-center justify-center w-12 h-12 bg-success-light rounded-2xl mx-auto mb-2 shadow-[0_4px_0_rgba(27,138,78,0.22)]">
										<Image
											src="/larry_obrien.svg"
											alt="Larry O'Brien Trophy"
											width={28}
											height={28}
											className="h-7 w-7 object-contain"
										/>
									</div>
									<h2 className="font-title text-xl font-bold text-gray-800 dark:text-gray-100">
										Weekly Leaderboard
									</h2>
									<p className="text-gray-500 dark:text-gray-400 text-sm">
										Last 7 days • Top 5 only
									</p>
								</div>

								{!stats && !statsError && (
									<p
										className="text-center text-gray-400 dark:text-gray-500"
										role="status"
										aria-live="polite"
									>
										Loading stats...
									</p>
								)}
								{!stats && statsError && (
									<p className="text-center text-amber-600 dark:text-amber-400" role="alert">
										Stats currently unavailable.
									</p>
								)}

								{stats && (
									<div className="space-y-4">
										<div className="flex items-center justify-between rounded-2xl border-2 border-success/20 bg-success-light/40 dark:bg-success-dark/20 px-4 py-3">
											<div>
												<p className="text-xs font-bold uppercase tracking-wide text-success-dark dark:text-success-light">
													Longest Streak
												</p>
												<p className="text-lg font-bold text-gray-800 dark:text-gray-100">
													{stats.longestStreak} connections
												</p>
											</div>
											<div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white dark:bg-gray-800 shadow-sm">
												<Flame className="h-5 w-5 text-basketball" />
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

										<p className="text-center text-xs text-gray-400 dark:text-gray-500">
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
