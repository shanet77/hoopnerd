"use client";

import React from "react";
import { Target } from "lucide-react";
import { Player } from "@repo/types";
import { Card, CardHeader, CardTitle, CardContent } from "@repo/ui/card";

interface PlayerListProps {
  players: Player[];
  activePlayer: Player | null;
}

export function PlayerList({ players, activePlayer }: PlayerListProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Players in Room</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {players.map((player, index) => (
            <div
              key={player.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 ${
                player.name === activePlayer?.name
                  ? "bg-basketball text-white border-basketball"
                  : "bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600"
              }`}
            >
              <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-sm">
                {index + 1}
              </div>
              <span className="font-bold">{player.name}</span>
              {player.isCpu && (
                <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded-full font-medium">
                  CPU
                </span>
              )}
              {player.name === activePlayer?.name && (
                <Target className="h-3.5 w-3.5" aria-label="Active player" />
              )}
            </div>
          ))}
        </div>
        {players.length === 0 && (
          <p className="text-gray-500 dark:text-gray-400 text-center py-4">No players yet...</p>
        )}
      </CardContent>
    </Card>
  );
}
