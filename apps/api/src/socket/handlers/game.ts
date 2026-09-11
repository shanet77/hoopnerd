import { Socket } from "socket.io";
import { SubmitMoveRequest } from "@repo/types";
import { MatchEngine } from "../../services/MatchEngine";
import {
  AuthenticatedSocket,
  composeMiddlewares,
  requireSession,
  requireRoomAccess,
  requireCurrentTurn,
} from "../middleware/auth";
import {
  handleErrorOnSocket,
  HandleErrorOnSocketOptions,
} from "../middleware/validation";

const GAME_HANDLER_OPTIONS: HandleErrorOnSocketOptions = {
  defaultEvent: "game_error",
  legacyChannel: "game_error",
};

export function registerGameHandlers(
  socket: Socket,
  matchEngine: MatchEngine,
): void {
  // Pre-compose middleware pipeline (created once, not per-event)
  const requireValidSubmit = composeMiddlewares(
    requireSession((d) => d.playerToken),
    requireRoomAccess(matchEngine),
    requireCurrentTurn(matchEngine),
  );

  // ---------------------------------------------------------------------------
  // submit_move
  // ---------------------------------------------------------------------------
  socket.on("submit_move", async (data: SubmitMoveRequest) => {
    const { roomId, connectedPlayer } = data;

    requireValidSubmit(socket, data, async (error) => {
      if (error) {
        handleErrorOnSocket(socket, error, GAME_HANDLER_OPTIONS);
        return;
      }

      const authSocket = socket as AuthenticatedSocket;

      try {
        await matchEngine.applyMove(
          roomId,
          authSocket.player!.id,
          connectedPlayer,
        );
      } catch (err) {
        console.error("Error validating move:", err);
        socket.emit("game_error", "Error validating move");
        socket.to(roomId).emit("game_error", "Error validating move");
      }
    });
  });
}
