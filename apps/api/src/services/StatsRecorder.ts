import type { GameRoomState } from "@repo/types";
import type { Repository } from "@repo/database";

export async function recordGameStats(
  repo: Repository,
  room: GameRoomState,
): Promise<void> {
  await repo.recordGameStats(room);
}
