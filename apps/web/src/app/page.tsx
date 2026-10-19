"use client";

import { LoaderCircle, Zap, Bot, Flame } from "lucide-react";
import { Button } from "@repo/ui/button";
import { FeedbackBanner } from "@repo/ui/feedback-banner";
import { SocketProvider } from "./lib/socket";
import { useLobbyActions } from "./lib/useLobbyActions";
import { useLobbyStats } from "./lib/useLobbyStats";
import { useSoloLeaderboard } from "./lib/useSoloLeaderboard";
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
	const { stats, error: statsError } = useLobbyStats();
	const { entries: soloEntries, error: soloError } = useSoloLeaderboard();
	const {
		playerName,
		feedbackMessage,
		isMatchmaking,
		isCpuQueuing,
		minYear,
		maxYear,
		seasonsLoading,
		seasonYearMin,
		seasonYearMax,
		actionsDisabled,
		handleNameChange,
		handleSeasonChange,
		handleCreateRoom,
		handleJoinMatchmaking,
		handleCpuGame,
		handleSoloStreak,
		handleJoinRoom,
	} = useLobbyActions();

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
							onChange={handleNameChange}
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
							onChange={handleSeasonChange}
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
