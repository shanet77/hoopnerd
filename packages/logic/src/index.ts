import type { Player, PlayerConnection } from "@repo/types";
import type { Repository } from "@repo/database";

export { CpuEngine } from "./cpuEngine";
export type { CpuEngineDependencies } from "./cpuEngine";

/**
 * Validates a move: checks that both players exist and played together.
 */
export async function validateMove(
  repo: Repository,
  playerAId: number,
  playerBId: number,
  seasonYearMin?: number,
  seasonYearMax?: number,
): Promise<boolean> {
  return repo.validateMove(playerAId, playerBId, seasonYearMin, seasonYearMax);
}

/**
 * Gets connection details between two players who played together.
 */
export async function getConnectionDetails(
  repo: Repository,
  playerAId: number,
  playerBId: number,
  seasonYearMin?: number,
  seasonYearMax?: number,
): Promise<PlayerConnection | null> {
  return repo.getConnectionDetails(playerAId, playerBId, seasonYearMin, seasonYearMax);
}

/**
 * Gets player details by ID.
 */
export async function getPlayerById(
  repo: Repository,
  playerId: number,
): Promise<Player | null> {
  return repo.getPlayerById(playerId);
}
