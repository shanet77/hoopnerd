import React from "react";
import { ArrowDown } from "lucide-react";
import { Player, PlayerConnection } from "@repo/types";

interface ChainBoardProps {
  startingPlayer: Player;
  connections: PlayerConnection[];
}

interface ChainRow {
  player: Player;
  teamName?: string;
  seasonYear?: number;
}

const buildRows = (
  startingPlayer: Player,
  connections: PlayerConnection[],
): ChainRow[] => {
  const rows: ChainRow[] = [{ player: startingPlayer }];
  for (const connection of connections) {
    if (rows.some((row) => row.player.id === connection.toPlayer.id)) continue;
    rows.push({
      player: connection.toPlayer,
      teamName: connection.teamName,
      seasonYear: connection.seasonYear,
    });
  }
  return rows;
};

/**
 * The chain as a flat column of tiles, Poeltl-style: the starting player is
 * a green tile, every connection is a solid tile captioned with the shared
 * team and season, and the tile the next move must connect from is orange.
 */
export function ChainBoard({ startingPlayer, connections }: ChainBoardProps) {
  const rows = buildRows(startingPlayer, connections);
  const lastRow = rows[rows.length - 1];

  return (
    <ol className="flex flex-col items-center" aria-label="Player connection chain">
      {rows.map((row, index) => {
        const isStart = index === 0;
        const isTarget = row === lastRow && connections.length > 0;
        return (
          <li key={`${row.player.id}-${index}`} className="flex flex-col items-center w-full">
            {index > 0 && (
              <p className="py-1 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                {row.teamName ?? "Shared team"}
                {row.seasonYear ? ` · ${row.seasonYear}` : ""}
              </p>
            )}
            <div
              className={`w-full max-w-xs px-4 py-3 rounded-md text-center transition-colors ${
                isStart
                  ? "bg-success text-white"
                  : isTarget
                    ? "bg-basketball text-white"
                    : "bg-brand-600 dark:bg-brand-800 text-white"
              }`}
            >
              {isStart && (
                <span className="block text-[10px] font-bold uppercase tracking-widest opacity-80">
                  Start
                </span>
              )}
              <span className="block font-title text-lg font-bold leading-tight">
                {row.player.name}
              </span>
              {row.player.position && (
                <span className="block text-[11px] font-bold uppercase tracking-widest opacity-80">
                  {row.player.position}
                </span>
              )}
            </div>
            {index < rows.length - 1 && (
              <ArrowDown
                className="h-4 w-4 my-1 text-gray-300 dark:text-gray-600"
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
