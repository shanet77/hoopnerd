import type { GameRoomState, StatsResponse } from "@repo/types";
import type { StatsRepository } from "../repository";

export interface StatsEventSeed {
  eventType: string;
  playerName?: string;
  teamName?: string;
  seasonYear?: number;
  streakCount?: number;
}

export class InMemoryStatsRepository implements StatsRepository {
  private statsEvents: Array<{
    eventType: string;
    playerName: string | null;
    teamName: string | null;
    seasonYear: number | null;
    streakCount: number | null;
    createdAt: Date;
  }> = [];

  seedStatsEvents(
    events: Array<{
      eventType: string;
      playerName?: string;
      teamName?: string;
      seasonYear?: number;
      streakCount?: number;
    }>,
  ) {
    for (const e of events) {
      this.statsEvents.push({
        eventType: e.eventType,
        playerName: e.playerName ?? null,
        teamName: e.teamName ?? null,
        seasonYear: e.seasonYear ?? null,
        streakCount: e.streakCount ?? null,
        createdAt: new Date(),
      });
    }
  }

  async getStats(windowDays: number, timezone: string): Promise<StatsResponse> {
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const recent = this.statsEvents.filter((e) => e.createdAt >= cutoff);

    const count = <T>(
      items: T[],
      key: (item: T) => string | null | undefined,
    ) => {
      const map = new Map<string, number>();
      for (const item of items) {
        const k = key(item);
        if (k) map.set(k, (map.get(k) || 0) + 1);
      }
      return Array.from(map.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, 5);
    };

    return {
      windowDays,
      timezone,
      updatedAt: new Date().toISOString(),
      players: count(recent, (e) =>
        e.eventType === "player" ? e.playerName : null,
      ),
      teams: count(recent, (e) => (e.eventType === "team" ? e.teamName : null)),
      seasons: count(recent, (e) =>
        e.eventType === "season" ? String(e.seasonYear) : null,
      ).map((s) => ({ seasonYear: Number(s.name), count: s.count })),
      longestStreak: Math.max(
        0,
        ...recent
          .filter((e) => e.eventType === "streak")
          .map((e) => e.streakCount ?? 0),
      ),
    };
  }

  async recordGameStats(room: GameRoomState): Promise<void> {
    if (room.statsRecorded) return;
    room.statsRecorded = true;

    const events: Array<{
      eventType: string;
      playerName?: string;
      teamName?: string;
      seasonYear?: number;
      streakCount?: number;
    }> = [];

    for (const move of room.moves) {
      events.push({ eventType: "player", playerName: move.playerName });
    }
    for (const connection of room.connections) {
      if (connection.teamName) {
        events.push({ eventType: "team", teamName: connection.teamName });
      }
      if (connection.seasonYear) {
        events.push({
          eventType: "season",
          seasonYear: connection.seasonYear,
        });
      }
    }
    events.push({ eventType: "streak", streakCount: room.connections.length });

    for (const e of events) {
      this.statsEvents.push({
        eventType: e.eventType,
        playerName: e.playerName ?? null,
        teamName: e.teamName ?? null,
        seasonYear: e.seasonYear ?? null,
        streakCount: e.streakCount ?? null,
        createdAt: new Date(),
      });
    }
  }
}
