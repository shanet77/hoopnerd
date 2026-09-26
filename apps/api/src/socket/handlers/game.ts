import { Socket } from "socket.io";
import { SubmitMoveRequest } from "@repo/types";
import { MatchEngine } from "../../services/MatchEngine";
import { SessionAuthorizer } from "../SessionAuthorizer";
import { respondWithError } from "../socketProtocol";

export function registerGameHandlers(
  socket: Socket,
  matchEngine: MatchEngine,
): void {
  const authorizer = new SessionAuthorizer(matchEngine);

  // ---------------------------------------------------------------------------
  // submit_move
  // ---------------------------------------------------------------------------
  // Identity is resolved here; every game-state rule (is it your turn, was the
  // player already used, is the connection valid) is enforced by the engine.
  socket.on("submit_move", async (data: SubmitMoveRequest) => {
    let actor;
    try {
      actor = authorizer.authorize(socket.id, data.playerToken, data.roomId);
    } catch (error) {
      respondWithError(socket, error);
      return;
    }

    try {
      await matchEngine.applyMove(
        actor.roomId,
        actor.playerId,
        data.connectedPlayer,
      );
    } catch (err) {
      console.error("Error validating move:", err);
      socket.emit("game_error", "Error validating move");
      socket.to(actor.roomId).emit("game_error", "Error validating move");
    }
  });
}
