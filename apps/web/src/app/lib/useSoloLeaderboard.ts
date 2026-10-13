"use client";

import { useEffect, useState } from "react";
import type { SoloLeaderboardEntry } from "@repo/types";

export function useSoloLeaderboard() {
  const [entries, setEntries] = useState<SoloLeaderboardEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const apiHost =
          process.env.NEXT_PUBLIC_API_HOST || "http://localhost:3001";
        const response = await fetch(
          `${apiHost}/api/solo/leaderboard?windowDays=7&tz=America%2FNew_York`,
        );
        if (!response.ok) {
          setError(true);
          return;
        }
        const payload = await response.json();
        if (!Array.isArray(payload)) {
          setError(true);
          return;
        }
        setEntries(payload as SoloLeaderboardEntry[]);
      } catch (err) {
        setError(true);
        console.error("Error fetching solo leaderboard:", err);
      }
    };

    fetchLeaderboard();
  }, []);

  return { entries, error };
}
