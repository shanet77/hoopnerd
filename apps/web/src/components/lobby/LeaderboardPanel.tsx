"use client";

import React from "react";
import Image from "next/image";
import { SoloLeaderboardEntry, StatsResponse } from "@repo/types";
import { LeaderboardList } from "@repo/ui/leaderboard-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/tabs";

interface LeaderboardPanelProps {
  stats: StatsResponse | null;
  statsError: boolean;
  solo?: SoloLeaderboardEntry[] | null;
  soloError?: boolean;
}

export function LeaderboardPanel({
  stats,
  statsError,
  solo,
  soloError,
}: LeaderboardPanelProps) {
  return (
    <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
      <div className="flex items-center justify-center gap-2">
        <Image
          src="/larry_obrien.svg"
          alt="Larry O'Brien Trophy"
          width={22}
          height={22}
          className="h-6 w-6 object-contain"
        />
        <h2 className="font-title text-xl font-bold text-gray-800 dark:text-gray-100">
          Weekly Leaderboard
        </h2>
      </div>

      {!stats && !statsError && (
        <p
          className="text-center text-gray-400 dark:text-gray-500"
          role="status"
          aria-live="polite"
        >
          Loading stats...
        </p>
      )}
      {!stats && statsError && (
        <p className="text-center text-amber-600 dark:text-amber-400" role="alert">
          Stats currently unavailable.
        </p>
      )}

      {stats && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
              Longest Streak
            </span>
            <span className="font-title text-lg font-bold text-gray-800 dark:text-gray-100 tabular-nums">
              {stats.longestStreak} connections
            </span>
          </div>

          <Tabs defaultValue="players">
            <TabsList>
              <TabsTrigger value="players">Players</TabsTrigger>
              <TabsTrigger value="teams">Teams</TabsTrigger>
              <TabsTrigger value="seasons">Seasons</TabsTrigger>
              {solo !== undefined && <TabsTrigger value="streaks">Streaks</TabsTrigger>}
            </TabsList>
            <TabsContent value="players" className="pt-2">
              <LeaderboardList
                items={stats.players.slice(0, 5).map((p) => ({
                  label: p.name,
                  value: p.count,
                }))}
              />
            </TabsContent>
            <TabsContent value="teams" className="pt-2">
              <LeaderboardList
                items={stats.teams.slice(0, 5).map((t) => ({
                  label: t.name,
                  value: t.count,
                }))}
              />
            </TabsContent>
            <TabsContent value="seasons" className="pt-2">
              <LeaderboardList
                items={stats.seasons.slice(0, 5).map((s) => ({
                  label: String(s.seasonYear),
                  value: s.count,
                }))}
              />
            </TabsContent>
            {solo !== undefined && (
              <TabsContent value="streaks" className="pt-2">
                {soloError ? (
                  <p
                    className="text-center text-amber-600 dark:text-amber-400"
                    role="alert"
                  >
                    Streaks currently unavailable.
                  </p>
                ) : !Array.isArray(solo) || solo.length === 0 ? (
                  <p
                    className="text-center text-gray-400 dark:text-gray-500"
                    role="status"
                  >
                    No streaks yet this week — be the first!
                  </p>
                ) : (
                  <LeaderboardList
                    items={solo.slice(0, 5).map((entry) => ({
                      label: entry.name,
                      value: entry.streak,
                    }))}
                  />
                )}
              </TabsContent>
            )}
          </Tabs>
        </div>
      )}
    </div>
  );
}
