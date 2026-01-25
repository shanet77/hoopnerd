"use client";

import { useEffect, useState, ChangeEvent, FormEvent } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
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

// Wrap the main component with SocketProvider
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

  // Track socket connection status
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
          setGameMessage(`Game Over! ${gameWinner.name} wins. ${reason}`);
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

  // Join a room
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

  // If socket is not initialized yet, don't render the game UI
  if (!socket) {
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6">
          HoopNerd - Basketball Trivia Game
        </h1>
        <Card>
          <CardContent className="text-center py-10">
            <p>Connecting to the game server...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Search for players
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

  // Handle search input changes
  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (query.length >= 2) {
      searchPlayers(query);
    } else {
      setSearchResults([]);
    }
  };

  // Submit a move
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

  // Leave room
  const handleLeaveRoom = () => {
    if (roomState && socket) {
      leaveRoom(socket, roomState.roomId);
      setRoomState(null);
      setGameMessage("Left the room");
    } else if (!socket) {
      setGameMessage("Please wait for socket connection");
    }
  };

  const isMyTurn = activePlayer?.name === playerName;

  return (
    <div className="container mx-auto p-4 max-w-4xl min-h-screen">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-primary-600 to-primary-800 bg-clip-text text-transparent">
          HoopNerd
        </h1>
        <p className="text-gray-600">Basketball Trivia Game</p>
      </div>

      <Card className="mb-6">
        <CardContent>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Status:</span>
            <Badge variant={isConnected ? "success" : "error"}>
              {isConnected ? "Connected" : "Disconnected"}
            </Badge>
          </div>
          {gameMessage && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">{gameMessage}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Game Controls - Only show if in a room */}
      {roomState && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Room: {roomState.roomId}</CardTitle>
              <Button onClick={handleLeaveRoom} variant="danger">
                Leave Room
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Game Status */}
            <div className="mb-6">
              {winner ? (
                <div className="text-center text-2xl font-bold text-green-600">
                  {winner.name} wins! {winReason}
                </div>
              ) : roomState.gameStarted ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-4">
                    <div className={`px-4 py-2 rounded-lg ${isMyTurn ? 'bg-indigo-100 border-2 border-indigo-500' : 'bg-gray-100'}`}>
                      <p className="text-sm text-gray-600">Current Turn</p>
                      <p className="text-xl font-bold">{activePlayer?.name}</p>
                    </div>
                    <div className="text-2xl font-mono">{timeRemaining}s</div>
                  </div>
                  
                  {roomState.startingPlayer && (
                    <div className="flex items-center justify-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                        <span>Starting: <strong>{roomState.startingPlayer.name}</strong></span>
                      </div>
                      {roomState.lastConnectedPlayer && (
                        <>
                          <span>→</span>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
                            <span>Last: <strong>{roomState.lastConnectedPlayer.name}</strong></span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  
                  {!isMyTurn && (
                    <p className="text-center text-gray-600">
                      Wait for {activePlayer?.name}'s turn
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-center">Waiting for players...</p>
              )}
            </div>

            {/* Error Message Display */}
            {gameMessage && (gameMessage.includes('Invalid') || gameMessage.includes('Invalid connection') || gameMessage.includes('not play with')) && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                    <span className="text-white text-sm font-bold">×</span>
                  </div>
                  <p className="text-red-800 font-medium">{gameMessage}</p>
                </div>
              </div>
            )}

            {/* Player Graph Visualization */}
            {roomState.gameStarted && (
              <div className="mb-6">
                <h3 className="font-medium mb-2">Player Chain</h3>
                <PlayerGraph 
                  startingPlayer={roomState.startingPlayer} 
                  connections={roomState.connections} 
                />
              </div>
            )}

            {/* Current Players in Room */}
            <div className="mb-6">
              <h3 className="font-medium mb-2">Players in Room:</h3>
              <div className="flex flex-wrap gap-2">
                {roomState.players.map((player, index) => (
                  <Badge key={index} variant="info">
                    {player.name}
                  </Badge>
                ))}
                {roomState.players.length === 0 && (
                  <p>No players in the room yet</p>
                )}
              </div>
            </div>

            {/* Move Submission */}
            <div className="mb-6">
              <h3 className="font-medium mb-2">Submit a Move</h3>
              <p className="text-sm text-gray-600 mb-4">
                Connect a player to <strong>{roomState.lastConnectedPlayer?.name || 'the starting player'}</strong> who played with them on the same team in the same season.
              </p>

              <form onSubmit={handleSubmitMove} className="space-y-4">
                {/* Connected Player Selection */}
                <div>
                  <Input
                    type="text"
                    label="Select Player to Connect"
                    value={connectedPlayer?.name || ""}
                    readOnly
                    placeholder="Search and select a player..."
                    className="bg-gray-100"
                  />
                </div>

                {/* Player Search */}
                <div>
                  <Input
                    type="text"
                    label="Search Players"
                    value={searchQuery}
                    onChange={handleSearchChange}
                    placeholder="Start typing a player name..."
                    className="text-gray-900"
                  />

                  {searchResults.length > 0 && (
                    <div className="mt-2 border rounded-md max-h-60 overflow-y-auto bg-white">
                      {searchResults.map((player) => (
                        <div
                          key={player.id}
                          className="p-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 transition-colors"
                          onClick={() => {
                            setConnectedPlayer(player);
                            setSearchQuery("");
                            setSearchResults([]);
                          }}
                        >
                          <span className="font-medium text-gray-900">{player.name}</span>{" "}
                          <span className="text-gray-700">
                            ({player.position})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={!isMyTurn || !connectedPlayer}
                  variant="primary"
                  className="w-full"
                >
                  Submit Move
                </Button>
              </form>
            </div>

            {/* Move History */}
            <div>
              <h3 className="font-medium mb-2">Move History</h3>
              {roomState.moves.length > 0 ? (
                <div className="border rounded-md divide-y">
                  {roomState.moves.map((move, index) => (
                    <div key={index} className="p-3">
                      <span className="font-medium">{move.playerName}</span>{" "}
                      <span className="text-gray-600">({move.position})</span>{" "}
                      connected
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-600">No moves yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
