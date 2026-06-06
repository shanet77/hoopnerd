"use client";

import React, { useRef, useEffect, useCallback } from "react";
import { Player } from "@repo/types";
import { Input } from "@repo/ui/input";
import { usePlayerSearch } from "../../app/lib/usePlayerSearch";

interface PlayerSearchProps {
  apiHost: string;
  selectedPlayer: Player | null;
  onSelect: (player: Player) => void;
}

export function PlayerSearch({
  apiHost,
  selectedPlayer,
  onSelect,
}: PlayerSearchProps) {
  const {
    searchQuery,
    searchResults,
    handleSearchChange,
    clearSearch,
  } = usePlayerSearch(apiHost);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (searchResults.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < searchResults.length - 1 ? prev + 1 : 0,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : searchResults.length - 1,
        );
      } else if (e.key === "Enter" && highlightedIndex >= 0) {
        e.preventDefault();
        const player = searchResults[highlightedIndex];
        if (player) {
          onSelect(player);
          clearSearch();
          setHighlightedIndex(-1);
        }
      } else if (e.key === "Escape") {
        clearSearch();
        setHighlightedIndex(-1);
        searchInputRef.current?.blur();
      }
    },
    [searchResults, highlightedIndex, onSelect, clearSearch],
  );

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchResults]);

  const handleSelect = (player: Player) => {
    onSelect(player);
    clearSearch();
    setHighlightedIndex(-1);
  };

  return (
    <div className="space-y-4">
      <div>
        <Input
          type="text"
          label="Selected Player"
          value={selectedPlayer?.name || ""}
          readOnly
          onClick={() => searchInputRef.current?.focus()}
          placeholder="Currently Selected Player"
          icon={<span>👤</span>}
        />
      </div>

      <div>
        <Input
          type="text"
          label="Search Players"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a player name..."
          icon={<span>🔍</span>}
          ref={searchInputRef}
        />

        {searchResults.length > 0 && (
          <div
            ref={listboxRef}
            className="mt-2 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-700 max-h-60 overflow-y-auto"
            role="listbox"
            aria-label="Player search results"
          >
            {searchResults.map((player, index) => (
              <button
                key={player.id}
                type="button"
                className={`p-3 cursor-pointer transition-colors flex items-center gap-3 w-full text-left ${
                  index === highlightedIndex
                    ? "bg-brand-50 dark:bg-brand-900/30"
                    : "hover:bg-brand-50 dark:hover:bg-brand-900/30"
                }`}
                onClick={() => handleSelect(player)}
                onMouseEnter={() => setHighlightedIndex(index)}
                aria-label={`Select ${player.name}${player.position ? `, ${player.position}` : ""}`}
              >
                <div className="w-10 h-10 bg-brand-100 dark:bg-brand-900/40 rounded-full flex items-center justify-center">
                  <span className="text-lg">🏀</span>
                </div>
                <div>
                  <span className="font-bold text-gray-800 dark:text-gray-100 block">
                    {player.name}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {player.position}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {searchQuery.length >= 2 && searchResults.length === 0 && (
          <p className="mt-2 text-sm text-gray-400 dark:text-gray-500 text-center py-2">
            No players found
          </p>
        )}
      </div>
    </div>
  );
}
