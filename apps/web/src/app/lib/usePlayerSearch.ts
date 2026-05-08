"use client";

import { useState, useCallback, useRef } from "react";
import { Player } from "@repo/types";

export function usePlayerSearch(apiHost: string) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

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
        setSearchResults(players);
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
