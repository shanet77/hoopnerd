"use client";

import { useEffect, useState } from "react";
import { StatsResponse } from "@repo/types";

export function useLobbyStats() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const apiHost =
          process.env.NEXT_PUBLIC_API_HOST || "http://localhost:3001";
        const response = await fetch(
          `${apiHost}/api/stats?windowDays=7&tz=America%2FNew_York`,
        );
        if (!response.ok) {
          setError(true);
          return;
        }
        const payload = (await response.json()) as StatsResponse;
        setStats(payload);
      } catch (err) {
        setError(true);
        console.error("Error fetching stats:", err);
      }
    };

    fetchStats();
  }, []);

  return { stats, error };
}
