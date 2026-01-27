"use client";

import { useEffect, useState, ChangeEvent, FormEvent } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  CardDescription,
} from "@repo/ui/card";
import { Badge } from "@repo/ui/badge";
import {
  SocketProvider,
  useSocket,
  joinRoom,
  submitMove,
  leaveRoom,
} from "../../lib/socket";
import {
  Player,
  GameRoomState,
  JoinRoomRequest,
  SubmitMoveRequest,
} from "@repo/types";
import ClientOnly from "../../../components/ClientOnly";
import { PlayerGraph } from "../../../components/game/PlayerGraph";

export default function Room() {
  return (
    <ClientOnly>
      <SocketProviderWrapper />
    </ClientOnly>
  );
}

function SocketProviderWrapper() {
  return (
    <SocketProvider>
      <GamePage />
    </SocketProvider>
  );
}

function GamePage() {
  const { socket, isConnected: socketConnected } = useSocket();
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const playerName = searchParams.get("playerName") || "Player";

  const [activePlayer, setActivePlayer] = useState<Player | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(25);
  const [winner, setWinner] = useState<Player | null>(null);
  const [winReason, setWinReason] = useState<string>("");

  const [connectedPlayer, setConnectedPlayer] = useState<Player | null>(null);
  const [roomState, setRoomState] = useState<GameRoomState | null>(null);
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [gameMessage, setGameMessage] = useState<string>("");
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (roomState?.gameStarted && !roomState.gameCompleted) {
      timer = setInterval(() => {
        setTimeRemaining((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [roomState?.gameStarted, roomState?.gameCompleted]);

  useEffect(() => {
    if (socket) {
      setIsConnected(socketConnected);

      const handleConnect = () => setIsConnected(true);
      const handleDisconnect = () => setIsConnected(false);

      socket.on("connect", handleConnect);
      socket.on("disconnect", handleDisconnect);

      socket.on("room_updated", (state: GameRoomState) => {
        setRoomState(state);
      });

      socket.on("game_started", (state: GameRoomState) => {
        setRoomState(state);
        setActivePlayer(state.players[state.currentPlayerIndex]);
        setTimeRemaining(25);
      });

      socket.on("turn_changed", (player: Player) => {
        setActivePlayer(player);
        setTimeRemaining(25);
        setGameMessage(`${player.name}'s turn!`);
      });

      socket.on(
        "game_over",
        ({
          winner: gameWinner,
          reason,
        }: {
          winner: Player;
          reason: string;
        }) => {
          setWinner(gameWinner);
          setWinReason(reason);
          setGameMessage(`Game Over! ${gameWinner.name} wins!`);
        },
      );

      socket.on("move_submitted", (data) => {
        if (data.roomState) {
          setRoomState(data.roomState);
        }
        setGameMessage(data.message);
      });

      socket.on("player_connected", (player: Player) => {
        setGameMessage(`${player.name} joined the game`);
      });

      socket.on("player_disconnected", (name: string) => {
        setGameMessage(`${name} left the game`);
      });

      socket.on("game_error", (error: string) => {
        setGameMessage(`Error: ${error}`);
      });

      return () => {
        socket.off("connect", handleConnect);
        socket.off("disconnect", handleDisconnect);
        socket.off("room_updated");
        socket.off("move_submitted");
        socket.off("player_connected");
        socket.off("player_disconnected");
        socket.off("game_error");
        socket.off("game_started");
        socket.off("turn_changed");
        socket.off("game_over");
      };
    }
  }, [socket, socketConnected]);

  useEffect(() => {
    if (socket && roomId && playerName) {
      const requestData: JoinRoomRequest = { roomId, playerName };
      joinRoom(socket, requestData).then((response) => {
        if (response.success) {
          setRoomState(response.roomState || null);
          setGameMessage(response.message);
        } else {
          setGameMessage(`Failed to join room: ${response.message}`);
        }
      });
    }
  }, [socket, roomId, playerName]);

  if (!socket) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="py-12 space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-100 rounded-2xl animate-pulse">
              <span className="text-3xl">🏀</span>
            </div>
            <CardTitle>Connecting...</CardTitle>
            <p className="text-gray-500">Setting up your game!</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const searchPlayers = async (query: string) => {
    if (query.trim() === "") {
      setSearchResults([]);
      return;
    }

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_HOST || "http://localhost:3001"}/api/players/search?q=${encodeURIComponent(query)}`,
      );
      const players: Player[] = await response.json();
      setSearchResults(players);
    } catch (error) {
      console.error("Error searching players:", error);
      setSearchResults([]);
    }
  };

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (query.length >= 2) {
      searchPlayers(query);
    } else {
      setSearchResults([]);
    }
  };

  const handleSubmitMove = async (e: FormEvent) => {
    e.preventDefault();

    if (!roomState || !connectedPlayer || !socket) {
      setGameMessage(
        "Please select a player to connect and wait for socket connection",
      );
      return;
    }

    const moveData: SubmitMoveRequest = {
      roomId: roomState.roomId,
      player: roomState.lastConnectedPlayer || roomState.startingPlayer!,
      connectedPlayer: connectedPlayer,
    };

    try {
      const response = await submitMove(socket, moveData);

      if (response.success) {
        setGameMessage(response.message);
        setConnectedPlayer(null);
        setSearchQuery("");
        setSearchResults([]);
      } else {
        setGameMessage(response.message);
      }
    } catch (error) {
      console.error("Error submitting move:", error);
      setGameMessage("Error submitting move");
    }
  };

  const handleLeaveRoom = () => {
    if (roomState && socket) {
      leaveRoom(socket, roomState.roomId);
    }
    router.push("/");
  };

  const isMyTurn = activePlayer?.name === playerName;
  const progressPercent = (timeRemaining / 25) * 100;
  const isUrgent = timeRemaining <= 5;

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="secondary" size="sm" onClick={handleLeaveRoom}>
            ← Leave
          </Button>
          <Badge variant={isConnected ? "success" : "error"} size="sm">
            {isConnected ? "Online" : "Offline"}
          </Badge>
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border-2 border-gray-200">
            <span className="text-lg">🏀</span>
            <span className="font-bold text-gray-700">{roomId}</span>
          </div>
        </div>

        {winner ? (
          <div className="space-y-6">
            <Card className="text-center py-8 bg-warning-light/50 border-warning/30">
              <div className="inline-flex items-center justify-center w-24 h-24 bg-warning rounded-full mx-auto mb-4 shadow-lg animate-bounce">
                <span className="text-5xl">🏆</span>
              </div>
              <CardTitle className="text-3xl text-warning-dark mb-2">
                {winner.name} Wins!
              </CardTitle>
              <p className="text-gray-600 font-medium">{winReason}</p>
            </Card>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={handleLeaveRoom}
              >
                Back to Lobby
              </Button>
            </div>
          </div>
        ) : roomState ? (
          <>
            <Card className="bg-white">
              <CardContent className="py-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-gray-500 uppercase tracking-wide">
                    Current Turn
                  </span>
                  <Badge variant={isMyTurn ? "basketball" : "info"} size="lg">
                    {isMyTurn ? "🎯 Your Turn!" : activePlayer?.name}
                  </Badge>
                </div>
                <div className="relative h-4 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`absolute left-0 top-0 h-full rounded-full transition-all duration-1000 ${
                      isUrgent ? "bg-error" : "bg-success"
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2">
                  <span
                    className={`font-bold text-2xl ${isUrgent ? "text-error countdown-pulse" : "text-gray-700"}`}
                  >
                    {timeRemaining}s
                  </span>
                  <span className="text-sm text-gray-500 font-medium">
                    {roomState.moves.length} moves made
                  </span>
                </div>
              </CardContent>
            </Card>

            {gameMessage &&
              (gameMessage.includes("Invalid") ||
                gameMessage.includes("not play with")) && (
                <div className="p-4 bg-error-light border-2 border-error/30 rounded-2xl">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">❌</span>
                    <p className="font-bold text-error-dark">{gameMessage}</p>
                  </div>
                </div>
              )}

            {gameMessage &&
              !gameMessage.includes("Invalid") &&
              gameMessage.includes("turn") && (
                <div className="p-3 bg-brand-100 border-2 border-brand/30 rounded-xl text-center">
                  <p className="font-bold text-brand-700">{gameMessage}</p>
                </div>
              )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Player Chain</CardTitle>
                <CardDescription>
                  Build the longest chain of connected players!
                </CardDescription>
              </CardHeader>
              <CardContent>
                {roomState.gameStarted && roomState.startingPlayer ? (
                  <div className="bg-gray-50 rounded-xl p-4 border-2 border-gray-100">
                    <PlayerGraph
                      startingPlayer={roomState.startingPlayer}
                      connections={roomState.connections}
                    />
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <span className="text-4xl block mb-2">⏳</span>
                    Waiting for game to start...
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Players in Room</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {roomState.players.map((player, index) => (
                    <div
                      key={index}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 ${
                        player.name === activePlayer?.name
                          ? "bg-basketball text-white border-basketball"
                          : "bg-gray-100 border-gray-200"
                      }`}
                    >
                      <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-sm">
                        {index + 1}
                      </div>
                      <span className="font-bold">{player.name}</span>
                      {player.name === activePlayer?.name && (
                        <span className="text-xs">🎯</span>
                      )}
                    </div>
                  ))}
                </div>
                {roomState.players.length === 0 && (
                  <p className="text-gray-500 text-center py-4">
                    No players yet...
                  </p>
                )}
              </CardContent>
            </Card>

            {isMyTurn && roomState.gameStarted && (
              <Card className="bg-success-light/30 border-success/30">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🎯</span>
                    <CardTitle>Make Your Move</CardTitle>
                  </div>
                  <CardDescription>
                    Connect a player to{" "}
                    <strong>
                      {roomState.lastConnectedPlayer?.name ||
                        roomState.startingPlayer?.name}
                    </strong>{" "}
                    who shared a team and season!
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmitMove} className="space-y-4">
                    <div>
                      <Input
                        type="text"
                        label="Selected Player"
                        value={connectedPlayer?.name || ""}
                        readOnly
                        placeholder="Search and select a player..."
                        icon={<span>👤</span>}
                      />
                    </div>

                    <div>
                      <Input
                        type="text"
                        label="Search Players"
                        value={searchQuery}
                        onChange={handleSearchChange}
                        placeholder="Type a player name..."
                        icon={<span>🔍</span>}
                      />

                      {searchResults.length > 0 && (
                        <div className="mt-2 bg-white border-2 border-gray-200 rounded-xl divide-y divide-gray-100 max-h-60 overflow-y-auto">
                          {searchResults.map((player) => (
                            <div
                              key={player.id}
                              className="p-3 cursor-pointer hover:bg-brand-50 transition-colors flex items-center gap-3"
                              onClick={() => {
                                setConnectedPlayer(player);
                                setSearchQuery("");
                                setSearchResults([]);
                              }}
                            >
                              <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center">
                                <span className="text-lg">🏀</span>
                              </div>
                              <div>
                                <span className="font-bold text-gray-800 block">
                                  {player.name}
                                </span>
                                <span className="text-sm text-gray-500">
                                  {player.position}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <Button
                      type="submit"
                      disabled={!connectedPlayer}
                      variant="success"
                      className="w-full text-lg py-4"
                    >
                      {connectedPlayer ? "Submit Move →" : "Select a Player"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {!isMyTurn && roomState.gameStarted && (
              <Card className="bg-gray-100 border-gray-200">
                <CardContent className="py-6 text-center">
                  <div className="text-4xl mb-2">⏰</div>
                  <p className="font-bold text-gray-600">
                    Waiting for {activePlayer?.name}'s move...
                  </p>
                </CardContent>
              </Card>
            )}

            {!roomState.gameStarted && (
              <Card className="bg-warning-light/30 border-warning/30">
                <CardContent className="py-6 text-center">
                  <div className="text-4xl mb-2">👥</div>
                  <p className="font-bold text-warning-dark">
                    Waiting for more players...
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    Share the room code with friends!
                  </p>
                </CardContent>
              </Card>
            )}

            {roomState.moves.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle>Move History</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {roomState.moves.map((move, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl"
                      >
                        <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center font-bold text-brand-700">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <span className="font-bold text-gray-800">
                            {move.playerName}
                          </span>
                          <span className="text-sm text-gray-500 ml-1">
                            ({move.position})
                          </span>
                        </div>
                        <span className="text-sm text-gray-400">
                          Move #{index + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <Card className="text-center py-8">
            <CardContent>
              <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-100 rounded-2xl animate-pulse mb-4">
                <span className="text-3xl">🏀</span>
              </div>
              <CardTitle>Joining Room...</CardTitle>
              <p className="text-gray-500 mt-2">Getting everything ready!</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
