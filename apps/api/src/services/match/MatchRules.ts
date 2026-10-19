import type { GameRoomState, Player, PlayerConnection } from "@repo/types";
import type { PlayersRepository } from "@repo/database";
import { hasPlayerBeenUsed } from "../../serverUtils";

export interface MoveRejection {
  message: string;
  errorPlayer?: string;
  expectedPlayer?: string;
}

export class MatchRules {
  constructor(private players: PlayersRepository) {}

  checkPreconditions(
    room: GameRoomState | undefined,
    playerId: number,
    connectedPlayer: Player,
  ): MoveRejection | null {
    if (!room || room.gameCompleted) {
      return { message: "Game is not active." };
    }
    if (!room.startingPlayer) {
      return { message: "Game not properly initialized." };
    }

    const requestingPlayer = room.players.find(
      (player) => player.id === playerId,
    );
    if (!requestingPlayer) {
      return { message: "Player is not part of this room." };
    }

    const currentPlayerTurn = room.players[room.currentPlayerIndex];
    if (!currentPlayerTurn || currentPlayerTurn.id !== requestingPlayer.id) {
      return { message: "Not your turn." };
    }

    if (hasPlayerBeenUsed(room, connectedPlayer.id)) {
      return {
        message: `Invalid move! ${connectedPlayer.name} was already used in this game.`,
      };
    }

    return null;
  }

  async resolveConnection(
    room: GameRoomState,
    connectedPlayer: Player,
  ): Promise<
    { rejection: MoveRejection } | { connection: PlayerConnection | null }
  > {
    if (!room.lastConnectedPlayer) {
      return { connection: null };
    }

    const isValidMove = await this.players.validateMove(
      room.lastConnectedPlayer.id,
      connectedPlayer.id,
      room.seasonYearMin,
      room.seasonYearMax,
    );

    if (!isValidMove) {
      return {
        rejection: {
          message: `Invalid connection! ${connectedPlayer.name} did not play with ${room.lastConnectedPlayer.name}`,
          errorPlayer: connectedPlayer.name,
          expectedPlayer: room.lastConnectedPlayer.name,
        },
      };
    }

    const connection = await this.players.getConnectionDetails(
      room.lastConnectedPlayer.id,
      connectedPlayer.id,
      room.seasonYearMin,
      room.seasonYearMax,
    );
    return { connection: connection ?? null };
  }

  recordMove(
    room: GameRoomState,
    connectedPlayer: Player,
  ): Player | null | undefined {
    const previousConnectedPlayer = room.lastConnectedPlayer;
    room.moves.push({
      playerId: connectedPlayer.id,
      playerName: connectedPlayer.name,
      position: connectedPlayer.position,
    });
    room.lastConnectedPlayer = connectedPlayer;
    return previousConnectedPlayer;
  }
}
