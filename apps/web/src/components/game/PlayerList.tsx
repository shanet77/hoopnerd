"use client";

import React from "react";
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
        {players.length === 0 && (
          <p className="text-gray-500 text-center py-4">No players yet...</p>
        )}
      </CardContent>
    </Card>
  );
}
