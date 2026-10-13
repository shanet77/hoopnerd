"use client";

import React from "react";
import Image from "next/image";
import { Flame } from "lucide-react";
import { SoloLeaderboardEntry, StatsResponse } from "@repo/types";
import { Card, CardContent } from "@repo/ui/card";
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
    <Card
      hover
      className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700"
    >
      <CardContent className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-success-light rounded-2xl mx-auto mb-2 shadow-[0_4px_0_rgba(27,138,78,0.22)]">
            <Image
              src="/larry_obrien.svg"
              alt="Larry O'Brien Trophy"
              width={28}
              height={28}
              className="h-7 w-7 object-contain"
            />
          </div>
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
            <div className="flex items-center justify-between rounded-2xl border-2 border-success/20 bg-success-light/40 dark:bg-success-dark/20 px-4 py-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-success-dark dark:text-success-light">
                  Longest Streak
                </p>
                <p className="text-lg font-bold text-gray-800 dark:text-gray-100">
                  {stats.longestStreak} connections
                </p>
              </div>
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white dark:bg-gray-800 shadow-sm">
                <Flame className="h-5 w-5 text-basketball" />
              </div>
            </div>

            <Tabs defaultValue="players">
              <TabsList>
                <TabsTrigger value="players">Players</TabsTrigger>
                <TabsTrigger value="teams">Teams</TabsTrigger>
                <TabsTrigger value="seasons">Seasons</TabsTrigger>
                {solo !== undefined && <TabsTrigger value="streaks">Streaks</TabsTrigger>}
              </TabsList>
              <TabsContent value="players">
                <LeaderboardList
                  items={stats.players.slice(0, 5).map((p) => ({
                    label: p.name,
                    value: p.count,
                  }))}
                />
              </TabsContent>
              <TabsContent value="teams">
                <LeaderboardList
                  items={stats.teams.slice(0, 5).map((t) => ({
                    label: t.name,
                    value: t.count,
                  }))}
                />
              </TabsContent>
              <TabsContent value="seasons">
                <LeaderboardList
                  items={stats.seasons.slice(0, 5).map((s) => ({
                    label: String(s.seasonYear),
                    value: s.count,
                  }))}
                />
              </TabsContent>
              {solo !== undefined && (
                <TabsContent value="streaks">
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
      </CardContent>
    </Card>
  );
}
