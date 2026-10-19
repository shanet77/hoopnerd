import type { Player, PlayerConnection } from "@repo/types";
import type { PlayersRepository } from "../repository";

export class InMemoryPlayersRepository implements PlayersRepository {
  private players: Map<number, Player> = new Map();
  private rosters: Array<{
    playerId: number;
    teammateId: number;
    seasonYear: number;
    teamId: number;
    teamName: string;
  }> = [];

  seedPlayers(players: Player[]) {
    for (const p of players) this.players.set(p.id, p);
  }

  seedRoster(
    playerId: number,
    teammateId: number,
    seasonYear: number,
    teamId: number,
    teamName: string,
  ) {
    this.rosters.push({
      playerId,
      teammateId,
      seasonYear,
      teamId,
      teamName,
    });
  }

  async searchPlayers(query: string): Promise<Player[]> {
    const q = query.trim().toLowerCase();
    return Array.from(this.players.values())
      .filter((p) => p.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({
        ...p,
        seasons: Array.from(
          new Set(
            this.rosters
              .filter((r) => r.playerId === p.id)
              .map((r) => r.seasonYear),
          ),
        ),
      }));
  }

  async getRandomPlayer(): Promise<Player | null> {
    const all = Array.from(this.players.values());
    return all.length > 0 ? all[Math.floor(Math.random() * all.length)] : null;
  }

  async getRandomTopScorer(
    _limit?: number,
    _seasonYearMin?: number,
    _seasonYearMax?: number,
  ): Promise<Player | null> {
    if (_seasonYearMin === undefined || _seasonYearMax === undefined) {
      return this.getRandomPlayer();
    }
    const rostered = Array.from(this.players.values()).filter((p) =>
      this.rosters.some(
        (r) =>
          r.playerId === p.id &&
          r.seasonYear >= _seasonYearMin! &&
          r.seasonYear <= _seasonYearMax!,
      ),
    );
    return rostered.length > 0
      ? rostered[Math.floor(Math.random() * rostered.length)]
      : null;
  }

  async getPlayerById(id: number): Promise<Player | null> {
    return this.players.get(id) ?? null;
  }

  async validateMove(
    playerAId: number,
    playerBId: number,
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<boolean> {
    return this.rosters.some(
      (r) =>
        r.playerId === playerAId &&
        r.teammateId === playerBId &&
        (seasonYearMin === undefined ||
          seasonYearMax === undefined ||
          (r.seasonYear >= seasonYearMin && r.seasonYear <= seasonYearMax)),
    );
  }

  async getConnectionDetails(
    playerAId: number,
    playerBId: number,
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<PlayerConnection | null> {
    const match = this.rosters.find(
      (r) =>
        r.playerId === playerAId &&
        r.teammateId === playerBId &&
        (seasonYearMin === undefined ||
          seasonYearMax === undefined ||
          (r.seasonYear >= seasonYearMin && r.seasonYear <= seasonYearMax)),
    );
    if (!match) return null;
    const from = this.players.get(match.playerId);
    const to = this.players.get(match.teammateId);
    if (!from || !to) return null;
    return {
      fromPlayer: { id: from.id, name: from.name, position: from.position },
      toPlayer: { id: to.id, name: to.name, position: to.position },
      seasonYear: match.seasonYear,
      teamName: match.teamName,
    };
  }

  async getValidCandidates(
    playerId: number,
    usedPlayerIds: number[],
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<Player[]> {
    const used = new Set(usedPlayerIds);
    const teammateIds = new Set<number>();
    for (const r of this.rosters) {
      if (
        r.playerId === playerId &&
        !used.has(r.teammateId) &&
        (seasonYearMin === undefined ||
          seasonYearMax === undefined ||
          (r.seasonYear >= seasonYearMin && r.seasonYear <= seasonYearMax))
      ) {
        teammateIds.add(r.teammateId);
      }
    }
    return Array.from(teammateIds)
      .map((id) => this.players.get(id))
      .filter((p): p is Player => p !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async hasAnyValidMove(
    playerId: number,
    usedPlayerIds: number[],
    seasonYearMin?: number,
    seasonYearMax?: number,
  ): Promise<boolean> {
    const candidates = await this.getValidCandidates(
      playerId,
      usedPlayerIds,
      seasonYearMin,
      seasonYearMax,
    );
    return candidates.length > 0;
  }

  async getSeasons(): Promise<number[]> {
    const years = new Set(this.rosters.map((r) => r.seasonYear));
    return Array.from(years).sort((a, b) => b - a);
  }
}
