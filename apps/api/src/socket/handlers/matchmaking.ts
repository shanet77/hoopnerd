import { Socket } from "socket.io";
import {
  JoinMatchmakingRequest,
  JoinMatchmakingResponse,
  Player,
} from "@repo/types";
import { MatchEngine } from "../../services/MatchEngine";
import { generatePlayerId, issueSessionToken } from "../../socketAuth";
import { requirePlayerName, respondWithError } from "../socketProtocol";

export function registerMatchmakingHandlers(
  socket: Socket,
  matchEngine: MatchEngine,
): void {
  socket.on("join_matchmaking", async (data: JoinMatchmakingRequest) => {
    const friendsOnly = data.friendsOnly ?? false;

    let normalizedName: string;
    try {
      normalizedName = requirePlayerName(data.playerName);
    } catch (error) {
      respondWithError(socket, error);
      return;
    }

    let selectedRoomId: string | null = null;
    let joinedExisting = false;

    // Find an available public room
    if (!friendsOnly) {
      selectedRoomId = matchEngine.findAvailablePublicRoom(normalizedName);
      if (selectedRoomId) {
        joinedExisting = true;
      }
    }

    // Fallback: create a new room
    if (!selectedRoomId) {
      selectedRoomId = generateRoomId();
      matchEngine.createRoom(selectedRoomId, friendsOnly);
    }

    const room = matchEngine.getRoom(selectedRoomId)!;

    // Validate room capacity and name uniqueness
    if (
      room.players.length >= 2 &&
      !room.players.some(
        (p) => p.name.toLowerCase() === normalizedName.toLowerCase(),
      )
    ) {
      socket.emit("matchmaking_result", {
        success: false,
        message: "Room is full.",
        joinedExisting,
      });
      return;
    }

    if (
      room.players.some(
        (p) => p.name.toLowerCase() === normalizedName.toLowerCase(),
      )
    ) {
      socket.emit("matchmaking_result", {
        success: false,
        message: "That name is already in use for this room.",
        joinedExisting,
      });
      return;
    }

    // --- join / create player ----------------------------------------------
    socket.join(selectedRoomId);

    const player: Player = {
      id: generatePlayerId(room),
      name: normalizedName,
      position: "G",
      socketId: socket.id,
    };
    room.players.push(player);
    matchEngine.bindSocket(socket.id, selectedRoomId, player.id);
    const playerToken = issueSessionToken(selectedRoomId, player.id);

    socket.to(selectedRoomId).emit("player_connected", player);
    socket.to(selectedRoomId).emit("room_updated", room);

    const response: JoinMatchmakingResponse = {
      success: true,
      message: joinedExisting
        ? `Joined existing room ${selectedRoomId}`
        : `Created and joined room ${selectedRoomId}`,
      roomId: selectedRoomId,
      roomState: room,
      joinedExisting,
      playerToken,
      playerId: player.id,
    };

    socket.emit("matchmaking_result", response);
    await matchEngine.start(selectedRoomId);
  });
}

function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
