"use client";

import { useState, FormEvent } from "react";
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
  joinRoom,
  joinMatchmaking,
} from "./lib/socket";
import ClientOnly from "../components/ClientOnly";

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
        router.push(
          `/room/${response.roomId}?playerName=${playerName}&friendsOnly=true`,
        );
      } else {
        setFeedbackMessage(`Failed to create room: ${response.message}`);
      }
    } catch (error) {
      console.error("Error creating friends room:", error);
      setFeedbackMessage("An error occurred while creating the friends room.");
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

    try {
      const response = await joinMatchmaking(socket, {
        playerName,
        friendsOnly: false,
      });
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
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-basketball rounded-2xl shadow-[0_6px_0_rgba(255,75,35,0.4)] mb-4">
            <span className="text-4xl">🏀</span>
          </div>
          <h1 className="text-4xl font-bold text-gray-800 tracking-tight">
            HoopNerd
          </h1>
          <p className="text-gray-500 font-medium">
            Connect basketball players to win!
          </p>
        </div>

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
              Enter your nickname to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              id="playerName"
              label="Your Nickname"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="King James, Black Mamba, Chef Curry..."
              className="text-sm text-gray-600"
            />
          </CardContent>
        </Card>

        <Card hover className="bg-success-light/30 border-success/30">
          <CardHeader className="text-center pb-2">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-success rounded-full mx-auto mb-2">
              <span className="text-2xl">⚡</span>
            </div>
            <CardTitle className="text-success-dark">Quick Play</CardTitle>
            <CardDescription>
              Get matched with a random player instantly
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
            <div className="inline-flex items-center justify-center w-12 h-12 bg-basketball rounded-full mx-auto mb-2">
              <span className="text-2xl">👥</span>
            </div>
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
    </div>
  );
}
