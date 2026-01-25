"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@repo/ui/card";
import { Badge } from "@repo/ui/badge";
import { SocketProvider, useSocket, createRoom, joinRoom, joinMatchmaking } from "./lib/socket";
import ClientOnly from "../components/ClientOnly";

// Wrap the main component with SocketProvider
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
  const router = useRouter();

  // Create a new room
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
        router.push(`/room/${response.roomId}?playerName=${playerName}`);
      } else {
        setFeedbackMessage(`Failed to create room: ${response.message}`);
      }
    } catch (error) {
      console.error("Error creating room:", error);
      setFeedbackMessage("An error occurred while creating the room.");
    }
  };

  // Create a friends-only room
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
        router.push(`/room/${response.roomId}?playerName=${playerName}&friendsOnly=true`);
      } else {
        setFeedbackMessage(`Failed to create room: ${response.message}`);
      }
    } catch (error) {
      console.error("Error creating friends room:", error);
      setFeedbackMessage("An error occurred while creating the friends room.");
    }
  };

  // Join matchmaking for random game
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

    try {
      const response = await joinMatchmaking(socket, { playerName, friendsOnly: false });
      if (response.success) {
        router.push(`/room/${response.roomId}?playerName=${playerName}`);
      } else {
        setFeedbackMessage(`Matchmaking failed: ${response.message}`);
      }
    } catch (error) {
      console.error("Error joining matchmaking:", error);
      setFeedbackMessage("An error occurred during matchmaking.");
    } finally {
      setIsMatchmaking(false);
    }
  };

  // Join an existing room
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

    router.push(`/room/${roomId}?playerName=${playerName}`);
  };

  return (
    <div className="container mx-auto p-4 max-w-lg min-h-screen">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-primary-600 to-primary-800 bg-clip-text text-transparent">
          HoopNerd
        </h1>
        <p className="text-gray-600">A Multiplayer Basketball Trivia Game</p>
      </div>

      <Card className="mb-6">
        <CardContent>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Status:</span>
            <Badge variant={isConnected ? "success" : "error"}>
              {isConnected ? "Connected" : "Disconnected"}
            </Badge>
          </div>
          {feedbackMessage && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">{feedbackMessage}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Player Name Input */}
      <Card className="mb-6">
        <CardHeader className="text-center">
          <CardTitle>Your Name</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            id="playerName"
            className="text-sm text-gray-600"
            label="Your Name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your name"
            required
          />
        </CardContent>
      </Card>

      {/* Quick Play Matchmaking */}
      <Card className="mb-6">
        <CardHeader className="text-center">
          <CardTitle>Quick Play</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 mb-4 text-center">
            Automatically match with a random player looking for a game
          </p>
          <div className="flex justify-center">
            <Button
              onClick={handleJoinMatchmaking}
              disabled={!isConnected || isMatchmaking || !playerName}
              variant="primary"
              className="w-full"
            >
              {isMatchmaking ? "Searching..." : "Find Match"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Create Room Section */}
      <Card className="mb-6">
        <CardHeader className="text-center">
          <CardTitle>Create a Private Game</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600 text-center">
            Create a room and share the code with friends to play together
          </p>
          <div className="flex justify-center">
            <Button
              onClick={handleCreateFriendsRoom}
              disabled={!isConnected || !playerName}
              variant="secondary"
              className="w-full"
            >
              Create Friends Room
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Join Room Section */}
      <Card>
        <CardHeader className="text-center">
          <CardTitle>Join with Code</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleJoinRoom} className="space-y-4">
            <Input
              id="roomId"
              className="text-sm text-gray-600 mb-4"
              label="Room Code"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Enter room code"
              required
            />
            <Button
              type="submit"
              disabled={!isConnected || !playerName}
              variant="outline"
              className="w-full"
            >
              Join Room
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
