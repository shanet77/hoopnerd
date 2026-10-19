import type { Pool } from "pg";
import type { Repositories } from "../repository";
import { PgPlayersRepository } from "./players";
import { PgStatsRepository } from "./stats";
import { PgGameStateRepository } from "./gameState";
import { PgSoloRepository } from "./solo";

export const createPgRepositories = (pool: Pool): Repositories => ({
  players: new PgPlayersRepository(pool),
  stats: new PgStatsRepository(pool),
  gameStates: new PgGameStateRepository(pool),
  solo: new PgSoloRepository(pool),
});
