import { Socket } from "socket.io";
import { CreateCpuGameRequest } from "@repo/types";
import { GameRoomRepository } from "../../services/GameRoomRepository";
import { CpuGameService } from "../../services/CpuGameService";
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
  roomRepository: GameRoomRepository,
  cpuGameService: CpuGameService,
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
        return;
      }

      const normalizedName = (result as any).normalizedName;
      const difficulty = "easy";

      // Generate a room ID
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();

      try {
        // Create the CPU game
        const { room, humanPlayer } = cpuGameService.createCpuGame(
          roomId,
          normalizedName,
          difficulty,
          socket.id,
        );

        // Join the human's socket to the room
        socket.join(roomId);
        roomRepository.bindSocket(socket.id, roomId, humanPlayer.id);
        const playerToken = issueSessionToken(roomId, humanPlayer.id);

        // Start the game immediately.
        // startGame → startTurnTimer → onCpuTurn callback triggers the CPU
        // if the CPU goes first. Subsequent CPU turns are triggered the same
        // way via switchTurn → startTurnTimer. This is server-side and
        // survives socket reconnects (page navigations).
        const started = await roomRepository.startGame(roomId);
        if (!started) {
          socket.emit("cpu_game_created", {
            success: false,
            message: "Failed to start CPU game.",
          });
          return;
        }

        // Send success response
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
