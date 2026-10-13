"use client";

import React, { FormEvent, useState } from "react";
import { Users, KeyRound } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";

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
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-basketball" aria-hidden="true" />
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
          Private Rooms
        </h3>
      </div>

      <Button
        onClick={onCreateRoom}
        disabled={disabled}
        variant="secondary"
        className="w-full"
      >
        <span className="inline-flex items-center justify-center gap-2">
          <Users className="h-5 w-5" />
          Create Room
        </span>
      </Button>

      <form onSubmit={handleJoinRoom} className="flex gap-2">
        <div className="flex-1">
          <Input
            id="roomId"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="Room code, e.g. ABC123"
            aria-label="Room code"
            className="text-sm"
          />
        </div>
        <Button
          type="submit"
          disabled={disabled || !roomId}
          variant="secondary"
          className="shrink-0"
        >
          <span className="inline-flex items-center justify-center gap-1.5">
            <KeyRound className="h-4 w-4" />
            Join Room
          </span>
        </Button>
      </form>
    </div>
  );
}
