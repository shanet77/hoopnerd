"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@repo/ui/card";
import { Badge } from "@repo/ui/badge";
import { SocketProvider, useSocket, createRoom, joinRoom } from "./lib/socket";
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
  const router = useRouter();

  // Create a new room
  const handleCreateRoom = async () => {
    if (!socket) {
      setFeedbackMessage("Please wait for the connection to be established.");
      return;
    }

    try {
      const response = await createRoom(socket);
      if (response.success) {
        router.push(`/room/${response.roomId}`);
      } else {
        setFeedbackMessage(`Failed to create room: ${response.message}`);
      }
    } catch (error) {
      console.error("Error creating room:", error);
      setFeedbackMessage("An error occurred while creating the room.");
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

      {/* Create Room Section */}
      <Card className="mb-6">
        <CardHeader className="text-center">
          <CardTitle>Create a New Game Room</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center">
            <Button
              onClick={handleCreateRoom}
              disabled={!isConnected}
              variant="primary"
              className="w-full"
            >
              Create Room
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Join Room Section */}
      <Card>
        <CardHeader className="text-center">
          <CardTitle>Join an Existing Room</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleJoinRoom} className="space-y-4">
            <Input
              id="roomId"
              label="Room ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Enter room ID"
              required
            />
            <Input
              id="playerName"
              label="Your Name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              required
            />
            <Button
              type="submit"
              disabled={!isConnected}
              variant="primary"
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
