import { InMemoryPlayersRepository } from "./players";
import { InMemoryStatsRepository } from "./stats";
import { InMemoryGameStateRepository } from "./gameState";
import { InMemorySoloRepository } from "./solo";

export interface InMemoryRepositories {
  players: InMemoryPlayersRepository;
  stats: InMemoryStatsRepository;
  gameStates: InMemoryGameStateRepository;
  solo: InMemorySoloRepository;
}

export const createInMemoryRepositories = (): InMemoryRepositories => ({
  players: new InMemoryPlayersRepository(),
  stats: new InMemoryStatsRepository(),
  gameStates: new InMemoryGameStateRepository(),
  solo: new InMemorySoloRepository(),
});
