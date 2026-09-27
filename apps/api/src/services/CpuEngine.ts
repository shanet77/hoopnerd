import type { CpuDifficulty, Player } from "@repo/types";
import type { Repository } from "@repo/database";

export interface CpuEngineDependencies {
  repository: Repository;
}

/**
 * The CPU engine evaluates all valid moves from a given player and picks
 * the best one based on difficulty level:
 *  - Easy: random valid move
 *  - Medium: prefer players with fewer total connections
 *  - Hard: 1-ply lookahead — pick the move that minimizes opponent's unused options
 */
export class CpuEngine {
  constructor(private deps: CpuEngineDependencies) {}

  /**
   * Returns the best player to connect to from the given lastConnectedPlayer.
   * Returns null if the CPU has no valid moves (CPU loses).
   *
   * @param lastConnectedPlayer - The player to connect FROM
   * @param usedPlayerIds - IDs already used in this game (including starting player and all moves)
   * @param difficulty - CPU difficulty level
   * @param seasonYearMin - Optional start of season range
   * @param seasonYearMax - Optional end of season range
   * @returns The chosen Player or null
   */
  async getBestMove(
    lastConnectedPlayer: Player,
    usedPlayerIds: number[],
    difficulty: CpuDifficulty,
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<Player | null> {
    // Get all valid candidates (players who shared team+season and not yet used)
    const candidates = await this.getValidCandidates(
      lastConnectedPlayer.id,
      usedPlayerIds,
      seasonYearMin,
      seasonYearMax,
    );

    if (candidates.length === 0) {
      return null;
    }

    switch (difficulty) {
      case "easy":
      default:
        return this.pickRandom(candidates);
    }
  }

  /**
   * Returns all valid players connected to the given player who haven't been used yet.
   */
  async getValidCandidates(
    playerId: number,
    usedPlayerIds: number[],
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<Player[]> {
    const { repository } = this.deps;
    return repository.getValidCandidates(playerId, usedPlayerIds, seasonYearMin, seasonYearMax);
  }

  /**
   * Easy: pick a random candidate.
   */
  private pickRandom(candidates: Player[]): Player {
    const index = Math.floor(Math.random() * candidates.length);
    return candidates[index];
  }
}
