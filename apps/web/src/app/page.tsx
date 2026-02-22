"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@repo/ui/card";
import { Badge } from "@repo/ui/badge";
import {
  SocketProvider,
  useSocket,
  createRoom,
  joinMatchmaking,
} from "./lib/socket";
import { trackEvent } from "./lib/analytics";
import { setPlayerSession } from "./lib/playerSession";
import ClientOnly from "../components/ClientOnly";

type PopularItem = { name: string; count: number };
type PopularSeason = { seasonYear: number; count: number };
type StatsResponse = {
  windowDays: number;
  timezone: string;
  updatedAt: string;
  players: PopularItem[];
  teams: PopularItem[];
  seasons: PopularSeason[];
  longestStreak: number;
};

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
  const [playerName, setPlayerName] = useState<string>("");
  const [feedbackMessage, setFeedbackMessage] = useState<string>("");
  const [isMatchmaking, setIsMatchmaking] = useState(false);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const router = useRouter();

  const handleCreateRoom = async () => {
    if (!socket) {
      setFeedbackMessage("Please wait for the connection to be established.");
      return;
    }

    if (!playerName) {
      setFeedbackMessage("Please enter your name first.");
      return;
    }

    try {
      const response = await createRoom(socket, false);
      if (response.success) {
        trackEvent("room_created", { mode: "public" });
        router.push(`/room/${response.roomId}?playerName=${playerName}`);
      } else {
        setFeedbackMessage(`Failed to create room: ${response.message}`);
        trackEvent("room_create_failed", { mode: "public" });
      }
    } catch (error) {
      console.error("Error creating room:", error);
      setFeedbackMessage("An error occurred while creating the room.");
      trackEvent("room_create_error", { mode: "public" });
    }
  };

  const handleCreateFriendsRoom = async () => {
    if (!socket) {
      setFeedbackMessage("Please wait for the connection to be established.");
      return;
    }

    if (!playerName) {
      setFeedbackMessage("Please enter your name first.");
      return;
    }

    try {
      const response = await createRoom(socket, true);
      if (response.success) {
        trackEvent("room_created", { mode: "friends_only" });
        router.push(
          `/room/${response.roomId}?playerName=${playerName}&friendsOnly=true`,
        );
      } else {
        setFeedbackMessage(`Failed to create room: ${response.message}`);
        trackEvent("room_create_failed", { mode: "friends_only" });
      }
    } catch (error) {
      console.error("Error creating friends room:", error);
      setFeedbackMessage("An error occurred while creating the friends room.");
      trackEvent("room_create_error", { mode: "friends_only" });
    }
  };

  const handleJoinMatchmaking = async () => {
    if (!socket) {
      setFeedbackMessage("Please wait for the connection to be established.");
      return;
    }

    if (!playerName) {
      setFeedbackMessage("Please enter your name first.");
      return;
    }

    setIsMatchmaking(true);
    setFeedbackMessage("Searching for a game...");
    trackEvent("matchmaking_started");

    try {
      const response = await joinMatchmaking(socket, {
        playerName,
        friendsOnly: false,
      });
      if (response.success) {
        trackEvent("matchmaking_joined_room", {
          joined_existing_room: response.joinedExisting,
        });
        if (response.roomId && response.playerToken && typeof response.playerId === "number") {
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

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const apiHost = process.env.NEXT_PUBLIC_API_HOST || "http://localhost:3001";
        const response = await fetch(
          `${apiHost}/api/stats?windowDays=7&tz=America%2FNew_York`,
        );
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as StatsResponse;
        setStats(payload);
      } catch (error) {
        console.error("Error fetching stats:", error);
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-basketball rounded-2xl shadow-[0_6px_0_rgba(255,75,35,0.4)] mb-4">
            <span className="text-4xl">🏀</span>
          </div>
          <h1 className="text-4xl font-bold text-gray-800 tracking-tight">
            HoopNerd
          </h1>
          <p className="text-gray-500 font-medium">
            Who played with who?
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          <div className="space-y-6">
            <Card hover>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-500 uppercase tracking-wide">
                    Status
                  </span>
                  <Badge variant={isConnected ? "success" : "error"}>
                    {isConnected ? "Connected" : "Disconnected"}
                  </Badge>
                </div>
                {feedbackMessage && (
                  <div className="p-3 bg-warning-light border-2 border-warning rounded-xl">
                    <p className="text-sm font-bold text-warning-dark text-center">
                      {feedbackMessage}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card hover>
              <CardHeader className="text-center pb-2">
                <CardTitle>Who's Playing?</CardTitle>
                <CardDescription>
                  Enter your name to get started
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Input
                  id="playerName"
                  label="Your name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="King James, Black Mamba, Chef Curry..."
                  className="text-sm text-gray-600"
                />
              </CardContent>
            </Card>

            <Card hover className="bg-success-light/30 border-success/30">
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-success-dark">Quick Play</CardTitle>
                <CardDescription>
                  Get matched with a random player
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={handleJoinMatchmaking}
                  disabled={!isConnected || isMatchmaking || !playerName}
                  variant="success"
                  className="w-full"
                >
                  {isMatchmaking ? "🔍 Searching..." : "Find Match"}
                </Button>
              </CardContent>
            </Card>

            <Card hover>
              <CardHeader className="text-center pb-2">
                <CardTitle>Play with Friends</CardTitle>
                <CardDescription>
                  Create a private room and share the code
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={handleCreateFriendsRoom}
                  disabled={!isConnected || !playerName}
                  variant="primary"
                  className="w-full"
                >
                  Create Room
                </Button>
              </CardContent>
            </Card>

            <Card hover>
              <CardHeader className="text-center pb-2">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-brand-100 rounded-full mx-auto mb-2">
                  <span className="text-2xl">🔑</span>
                </div>
                <CardTitle>Join with Code</CardTitle>
                <CardDescription>Enter a room code from a friend</CardDescription>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>

            <div className="text-center pt-4">
              <p className="text-xs text-gray-400 font-medium">
                How to play: Connect players who played together on the same team in
                the same season!
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <Card hover className="bg-white border-2 border-gray-200">
              <CardHeader className="text-center pb-2">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-success-light rounded-2xl mx-auto mb-2 shadow-[0_4px_0_rgba(88,204,2,0.25)]">
                  <span className="text-2xl">🏆</span>
                </div>
                <CardTitle className="text-gray-800">Weekly Leaderboard</CardTitle>
                <CardDescription>Last 7 days • Top 5 only</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-gray-600">
                {!stats && (
                  <p className="text-center text-gray-400">Loading stats...</p>
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

                    <div className="space-y-4">
                      <div className="rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-3">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-gray-800">Players</p>
                          <Badge variant="success">Top 5</Badge>
                        </div>
                        {stats.players.length ? (
                          <ol className="mt-3 space-y-2">
                            {stats.players.slice(0, 5).map((item, index) => (
                              <li
                                key={`${item.name}-${index}`}
                                className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-[0_2px_0_rgba(0,0,0,0.05)]"
                              >
                                <div className="flex items-center gap-3">
                                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                                    {index + 1}
                                  </span>
                                  <span className="font-semibold text-gray-700">
                                    {item.name}
                                  </span>
                                </div>
                                <span className="rounded-full bg-warning-light px-3 py-1 text-xs font-bold text-warning-dark">
                                  {item.count}
                                </span>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p className="mt-2 text-sm text-gray-400">No data yet</p>
                        )}
                      </div>

                      <div className="rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-3">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-gray-800">Teams</p>
                          <Badge variant="success">Top 5</Badge>
                        </div>
                        {stats.teams.length ? (
                          <ol className="mt-3 space-y-2">
                            {stats.teams.slice(0, 5).map((item, index) => (
                              <li
                                key={`${item.name}-${index}`}
                                className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-[0_2px_0_rgba(0,0,0,0.05)]"
                              >
                                <div className="flex items-center gap-3">
                                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                                    {index + 1}
                                  </span>
                                  <span className="font-semibold text-gray-700">
                                    {item.name}
                                  </span>
                                </div>
                                <span className="rounded-full bg-warning-light px-3 py-1 text-xs font-bold text-warning-dark">
                                  {item.count}
                                </span>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p className="mt-2 text-sm text-gray-400">No data yet</p>
                        )}
                      </div>

                      <div className="rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-3">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-gray-800">Seasons</p>
                          <Badge variant="success">Top 5</Badge>
                        </div>
                        {stats.seasons.length ? (
                          <ol className="mt-3 space-y-2">
                            {stats.seasons.slice(0, 5).map((item, index) => (
                              <li
                                key={`${item.seasonYear}-${index}`}
                                className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-[0_2px_0_rgba(0,0,0,0.05)]"
                              >
                                <div className="flex items-center gap-3">
                                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                                    {index + 1}
                                  </span>
                                  <span className="font-semibold text-gray-700">
                                    {item.seasonYear}
                                  </span>
                                </div>
                                <span className="rounded-full bg-warning-light px-3 py-1 text-xs font-bold text-warning-dark">
                                  {item.count}
                                </span>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p className="mt-2 text-sm text-gray-400">No data yet</p>
                        )}
                      </div>
                    </div>

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
    </div>
  );
}
