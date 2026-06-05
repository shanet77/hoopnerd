"use client";

import { useEffect, useMemo, useState } from "react";

export function useAvailableSeasons() {
  const [seasons, setSeasons] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSeasons = async () => {
      try {
        const apiHost =
          process.env.NEXT_PUBLIC_API_HOST || "http://localhost:3001";
        const response = await fetch(`${apiHost}/api/seasons`);
        if (!response.ok) {
          setLoading(false);
          return;
        }
        const data = (await response.json()) as number[];
        setSeasons(data);
      } catch (err) {
        console.error("Error fetching seasons:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSeasons();
  }, []);

  const { minYear, maxYear } = useMemo(() => {
    if (seasons.length === 0) return { minYear: undefined, maxYear: undefined };
    return {
      minYear: seasons[seasons.length - 1],
      maxYear: seasons[0],
    };
  }, [seasons]);

  return { seasons, minYear, maxYear, loading };
}
