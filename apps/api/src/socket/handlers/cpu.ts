import { Socket } from "socket.io";
import { CreateCpuGameRequest } from "@repo/types";
import { MatchEngine } from "../../services/MatchEngine";
import { issueSessionToken } from "../../socketAuth";
import {
  validatePlayerName,
  handleErrorOnSocket,
  HandleErrorOnSocketOptions,
} from "../middleware/validation";
import { composeMiddlewares } from "../middleware/auth";

const CPU_GAME_OPTIONS: HandleErrorOnSocketOptions = {
  defaultEvent: "cpu_game_created",
  legacyChannel: "cpu_game_created",
};

export function registerCpuGameHandlers(
  socket: Socket,
  matchEngine: MatchEngine,
): void {
  // ---------------------------------------------------------------------------
  // create_cpu_game
  // ---------------------------------------------------------------------------
  socket.on("create_cpu_game", async (data: CreateCpuGameRequest) => {
    const validateName = composeMiddlewares(
      validatePlayerName((d) => d.playerName),
    );

    validateName(socket, data, async (error, result) => {
      if (error) {
        handleErrorOnSocket(socket, error, CPU_GAME_OPTIONS);
        // The embed awaits `cpu_game_created` (rejecting only after a 15s
        // timeout), so always resolve it — otherwise an invalid name leaves
        // the iframe spinning instead of showing the retry card.
        socket.emit("cpu_game_created", {
          success: false,
          message: error instanceof Error ? error.message : "Invalid request.",
        });
        return;
      }

      const normalizedName = (result as any).normalizedName;
      const { seasonYearMin, seasonYearMax } = data;

      // Generate a room ID
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();

      try {
        const { room, humanPlayer } = matchEngine.createCpuGame(
          roomId,
          normalizedName,
          "easy",
          socket.id,
          seasonYearMin,
          seasonYearMax,
        );

        // Join the human's socket to the room
        socket.join(roomId);
        matchEngine.bindSocket(socket.id, roomId, humanPlayer.id);
        const playerToken = issueSessionToken(roomId, humanPlayer.id);

        // Start the game immediately. The engine drives CPU turns internally
        // from here on — no separate CPU service or turn callback to wire.
        const started = await matchEngine.start(roomId);
        if (!started) {
          socket.emit("cpu_game_created", {
            success: false,
            message: "Failed to start CPU game.",
          });
          return;
        }

        socket.emit("cpu_game_created", {
          success: true,
          message: "CPU game created!",
          roomId,
          roomState: room,
          playerToken,
          playerId: humanPlayer.id,
        });
      } catch (err) {
        console.error("Error creating CPU game:", err);
        socket.emit("cpu_game_created", {
          success: false,
          message: "Internal error creating CPU game.",
        });
      }
    });
  });
}
