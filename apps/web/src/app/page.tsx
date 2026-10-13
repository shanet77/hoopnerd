"use client";

import { useState, useEffect } from "react";
import { LoaderCircle, Zap, Bot, Flame } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@repo/ui/button";
import { FeedbackBanner } from "@repo/ui/feedback-banner";
import {
	SocketProvider,
	useSocket,
	createRoom,
	joinMatchmaking,
	createCpuGame,
} from "./lib/socket";
import { useLobbyStats } from "./lib/useLobbyStats";
import { useSoloLeaderboard } from "./lib/useSoloLeaderboard";
import { useAvailableSeasons } from "./lib/useAvailableSeasons";
import { trackEvent } from "./lib/analytics";
import {
	getPlayerName,
	setPlayerName,
	setPlayerSession,
} from "./lib/playerSession";
import ClientOnly from "../components/ClientOnly";
import { ThemeToggle } from "../components/ThemeToggle";
import { InlineNamePrompt } from "../components/lobby/InlineNamePrompt";
import { CpuSeasonPicker } from "../components/lobby/CpuSeasonPicker";
import { SecondaryActions } from "../components/lobby/SecondaryActions";
import { LeaderboardPanel } from "../components/lobby/LeaderboardPanel";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "unknown";

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
	const [playerName, setPlayerNameState] = useState<string>(() =>
		getPlayerName(),
	);
	const [feedbackMessage, setFeedbackMessage] = useState<string>("");
	const [isMatchmaking, setIsMatchmaking] = useState(false);
	const [isCpuQueuing, setIsCpuQueuing] = useState(false);
	const { stats, error: statsError } = useLobbyStats();
	const { entries: soloEntries, error: soloError } = useSoloLeaderboard();
	const { minYear, maxYear, loading: seasonsLoading } = useAvailableSeasons();
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

	const nameMissing = !playerName;
	const actionsDisabled = !isConnected || nameMissing;

	return (
		<main
			id="main-content"
			className="min-h-screen bg-gray-50 dark:bg-gray-900 py-10 px-4"
		>
			<div className="max-w-md mx-auto slide-up">
				<div className="flex items-center justify-center gap-4 mb-8">
					<h1 className="font-title text-4xl font-bold text-gray-800 dark:text-gray-100 tracking-tight uppercase">
						HoopNerd
					</h1>
					<ThemeToggle />
				</div>

				{feedbackMessage && (
					<FeedbackBanner variant="warning">
						{feedbackMessage}
					</FeedbackBanner>
				)}

				<div className="divide-y divide-gray-200 dark:divide-gray-700">
					<section className="py-5 space-y-3">
						<InlineNamePrompt
							value={playerName}
							onChange={(value) => {
								setPlayerNameState(value);
								if (feedbackMessage.includes("name")) {
									setFeedbackMessage("");
								}
							}}
						/>

						<Button
							onClick={handleJoinMatchmaking}
							disabled={actionsDisabled || isMatchmaking}
							variant="primary"
							size="lg"
							className="w-full"
						>
							{isMatchmaking ? (
								<span className="inline-flex items-center justify-center gap-2">
									<LoaderCircle className="h-5 w-5 animate-spin" />
									Searching...
								</span>
							) : (
								<span className="inline-flex items-center justify-center gap-2">
									<Zap className="h-5 w-5" />
									Quick Play
								</span>
							)}
						</Button>

						<Button
							onClick={handleSoloStreak}
							disabled={actionsDisabled}
							variant="outline"
							size="lg"
							className="w-full"
						>
							<span className="inline-flex items-center justify-center gap-2">
								<Flame className="h-5 w-5 text-basketball" />
								Solo Streak
							</span>
						</Button>
					</section>

					<section className="py-5 space-y-4">
						<div className="flex items-center gap-2">
							<Bot className="h-4 w-4 text-basketball" aria-hidden="true" />
							<h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
								Play vs CPU
							</h3>
						</div>
						<CpuSeasonPicker
							minYear={minYear}
							maxYear={maxYear}
							loading={seasonsLoading}
							seasonYearMin={seasonYearMin}
							seasonYearMax={seasonYearMax}
							onChange={(min, max) => {
								setSeasonYearMin(min);
								setSeasonYearMax(max);
							}}
						/>

						<Button
							onClick={handleCpuGame}
							disabled={actionsDisabled || isCpuQueuing}
							variant="basketball"
							size="lg"
							className="w-full"
						>
							{isCpuQueuing ? (
								"Starting..."
							) : (
								<span className="inline-flex items-center justify-center gap-2">
									<Bot className="h-5 w-5" />
									Play vs CPU
								</span>
							)}
						</Button>
					</section>

					<section className="py-5">
						<SecondaryActions
							disabled={actionsDisabled}
							onCreateRoom={() => handleCreateRoom(true)}
							onJoinRoom={handleJoinRoom}
						/>
					</section>

					<section className="py-5">
						<LeaderboardPanel
							stats={stats}
							statsError={statsError}
							solo={soloEntries}
							soloError={soloError}
						/>
					</section>

					<section className="pt-5">
						<p className="text-center text-xs text-gray-400 dark:text-gray-500 font-medium">
							How to play: Connect players who played together on the
							same team in the same season.
						</p>
						<p className="mt-4 text-center text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
							v{APP_VERSION}
						</p>
					</section>
				</div>
			</div>
		</main>
	);
}
