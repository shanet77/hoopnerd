"use client";

import React, { FormEvent, useState } from "react";
import { Users, KeyRound } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { LobbyActionCard } from "./LobbyActionCard";

interface SecondaryActionsProps {
  disabled: boolean;
  onCreateRoom: () => void;
  onJoinRoom: (roomId: string) => void;
}

export function SecondaryActions({
  disabled,
  onCreateRoom,
  onJoinRoom,
}: SecondaryActionsProps) {
  const [roomId, setRoomId] = useState<string>("");

  const handleJoinRoom = (e: FormEvent) => {
    e.preventDefault();
    onJoinRoom(roomId);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        More ways to play
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <LobbyActionCard
          title="Play with Friends"
          icon={<Users className="h-5 w-5" />}
          size="compact"
        >
          <Button
            onClick={onCreateRoom}
            disabled={disabled}
            variant="secondary"
            size="sm"
            className="w-full"
          >
            Create Room
          </Button>
        </LobbyActionCard>

        <LobbyActionCard
          title="Join with Code"
          icon={<KeyRound className="h-5 w-5" />}
          size="compact"
        >
          <form onSubmit={handleJoinRoom} className="space-y-2">
            <Input
              id="roomId"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="e.g., ABC123"
              aria-label="Room code"
              className="text-sm"
            />
            <Button
              type="submit"
              disabled={disabled || !roomId}
              variant="secondary"
              size="sm"
              className="w-full"
            >
              Join Room
            </Button>
          </form>
        </LobbyActionCard>
      </div>
    </div>
  );
}
