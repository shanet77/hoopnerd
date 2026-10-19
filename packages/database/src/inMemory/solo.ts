import type { SoloEndReason, SoloLeaderboardEntry } from "@repo/types";
import type {
  SoloRepository,
  SoloRunRecord,
  SoloRunRecordResult,
} from "../repository";

export class InMemorySoloRepository implements SoloRepository {
  private soloRuns: Array<{
    userId: string;
    displayName: string;
    streakCount: number;
    endReason: SoloEndReason;
    startedAt: Date;
    endedAt: Date;
  }> = [];
  private soloBests = new Map<string, number>();

  async recordSoloRun(run: SoloRunRecord): Promise<SoloRunRecordResult> {
    this.soloRuns.push({
      userId: run.userId,
      displayName: run.displayName,
      streakCount: run.streakCount,
      endReason: run.endReason,
      startedAt: run.startedAt,
      endedAt: new Date(),
    });
    const previous = this.soloBests.get(run.userId);
    const bestStreak =
      previous === undefined
        ? run.streakCount
        : Math.max(previous, run.streakCount);
    this.soloBests.set(run.userId, bestStreak);
    return {
      bestStreak,
      isNewBest: previous === undefined || run.streakCount > previous,
    };
  }

  async getSoloLeaderboard(
    windowDays: number,
    _timezone: string,
    limit: number,
  ): Promise<SoloLeaderboardEntry[]> {
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const best = new Map<string, SoloLeaderboardEntry>();
    for (const run of this.soloRuns) {
      if (run.endedAt < cutoff) continue;
      const current = best.get(run.userId);
      if (!current || run.streakCount > current.streak) {
        best.set(run.userId, {
          userId: run.userId,
          name: run.displayName,
          streak: run.streakCount,
        });
      }
    }
    return Array.from(best.values())
      .sort((a, b) => b.streak - a.streak || a.name.localeCompare(b.name))
      .slice(0, limit);
  }

  async getSoloBest(userId: string): Promise<number> {
    return this.soloBests.get(userId) ?? 0;
  }
}
