"use client";

import { useState, useCallback, useRef } from "react";
import { Player } from "@repo/types";

export interface PlayerSearchFilter {
  /** IDs der Spieler, die in der laufenden Kette bereits verwendet wurden. */
  usedPlayerIds: number[];
  /** Saisonfenster der Partie; Verbindungen müssen darin liegen. */
  seasonYearMin?: number;
  seasonYearMax?: number;
}

/**
 * Filtert Suchergebnisse client-seitig: bereits verwendete Spieler werden
 * ausgeschlossen, ebenso Spieler ohne Kader-Jahr innerhalb des
 * Saisonfensters. Spieler ohne Seasons-Daten bleiben bestehen, damit die
 * serverseitige Prüfung als Fallback greift.
 */
export function filterSearchResults(
  players: Player[],
  filter: PlayerSearchFilter,
): Player[] {
  const used = new Set(filter.usedPlayerIds);
  const hasWindow =
    filter.seasonYearMin !== undefined && filter.seasonYearMax !== undefined;

  return players.filter((player) => {
    if (used.has(player.id)) return false;
    if (hasWindow && player.seasons && player.seasons.length > 0) {
      const inWindow = player.seasons.some(
        (year) =>
          year >= filter.seasonYearMin! && year <= filter.seasonYearMax!,
      );
      if (!inWindow) return false;
    }
    return true;
  });
}

export function usePlayerSearch(
  apiHost: string,
  filter: PlayerSearchFilter,
) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const filterRef = useRef(filter);
  filterRef.current = filter;

  const searchPlayers = useCallback(
    async (query: string) => {
      if (query.trim().length < 2) {
        setSearchResults([]);
        return;
      }

      try {
        const response = await fetch(
          `${apiHost}/api/players/search?q=${encodeURIComponent(query)}`,
        );
        const players: Player[] = await response.json();
        setSearchResults(filterSearchResults(players, filterRef.current));
      } catch (error) {
        console.error("Error searching players:", error);
        setSearchResults([]);
      }
    },
    [apiHost],
  );

  const handleSearchChange = useCallback(
    (query: string) => {
      setSearchQuery(query);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (query.length >= 2) {
        debounceRef.current = setTimeout(() => {
          searchPlayers(query);
        }, 150);
      } else {
        setSearchResults([]);
      }
    },
    [searchPlayers],
  );

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
  }, []);

  return {
    searchQuery,
    searchResults,
    setSearchQuery,
    handleSearchChange,
    clearSearch,
  };
}
