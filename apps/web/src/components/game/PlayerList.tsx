import React from "react";
import { Player } from "@repo/types";

interface PlayerListProps {
  players: Player[];
  activePlayer: Player | null;
}

export function PlayerList({ players, activePlayer }: PlayerListProps) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">
        Players in Room
      </p>
      <div className="flex flex-wrap gap-2">
        {players.map((player) => {
          const isActive = player.name === activePlayer?.name;
          return (
            <span
              key={player.id}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold ${
                isActive
                  ? "bg-basketball text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
              }`}
            >
              {player.name}
              {player.isCpu && (
                <span
                  className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                    isActive ? "bg-white/25" : "bg-gray-200 dark:bg-gray-700"
                  }`}
                >
                  CPU
                </span>
              )}
            </span>
          );
        })}
      </div>
      {players.length === 0 && (
        <p className="text-gray-500 dark:text-gray-400 text-sm py-2">No players yet...</p>
      )}
    </div>
  );
}
