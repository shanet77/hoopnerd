import type { GameRoomState } from "@repo/types";
import type { StatsRepository } from "@repo/database";

export async function recordGameStats(
  repo: StatsRepository,
  room: GameRoomState,
): Promise<void> {
  await repo.recordGameStats(room);
}
