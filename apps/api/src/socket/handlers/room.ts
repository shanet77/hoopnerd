import { Socket } from "socket.io";
import {
  JoinRoomRequest,
  LeaveRoomRequest,
  Player,
} from "@repo/types";
import { MatchEngine } from "../../services/MatchEngine";
import { generatePlayerId, issueSessionToken } from "../../socketAuth";
import { SessionAuthorizer } from "../SessionAuthorizer";
import { requirePlayerName, respondWithError } from "../socketProtocol";

export function registerRoomHandlers(
  socket: Socket,
  matchEngine: MatchEngine,
): void {
  const authorizer = new SessionAuthorizer(matchEngine);

  // ---------------------------------------------------------------------------
  // create_room
  // ---------------------------------------------------------------------------
  socket.on("create_room", (friendsOnly: boolean = false) => {
    const roomId = generateRoomId();
    matchEngine.createRoom(roomId, friendsOnly);
    socket.emit("room_created", {
      success: true,
      message: `Room ${roomId} created successfully`,
      roomId,
    });
  });

  // ---------------------------------------------------------------------------
  // join_room — dual path: restore session or create new player
  // ---------------------------------------------------------------------------
  socket.on("join_room", async (data: JoinRoomRequest) => {
    const { roomId, playerToken } = data;

    let normalizedName: string;
    try {
      normalizedName = requirePlayerName(data.playerName);
    } catch (error) {
      respondWithError(socket, error);
      return;
    }

    const room = matchEngine.getOrCreateRoom(roomId);
    socket.join(roomId);

    // --- path A: restore existing player via session token -------------------
    if (playerToken) {
      // A returning client presents its token on a socket that is not bound
      // yet, so only the token is verified here; the binding is (re)established
      // below as part of re-joining.
      let playerId: number;
      try {
        playerId = authorizer.verifyToken(playerToken).playerId;
      } catch {
        socket.emit("room_joined", {
          success: false,
          message: "Invalid session token.",
        });
        return;
      }

      const existingPlayer = room.players.find((p) => p.id === playerId);
      if (!existingPlayer) {
        socket.emit("room_joined", {
          success: false,
          message: "Session is no longer valid for this room.",
        });
        return;
      }

      // Re-bind and issue a fresh token
      existingPlayer.socketId = socket.id;
      matchEngine.bindSocket(socket.id, roomId, existingPlayer.id);
      const newSessionToken = issueSessionToken(roomId, existingPlayer.id);

      socket.to(roomId).emit("room_updated", room);
      socket.emit("room_joined", {
        success: true,
        message: `Successfully joined room ${roomId}`,
        roomState: room,
        playerToken: newSessionToken,
        playerId: existingPlayer.id,
      });

      await matchEngine.start(roomId);
      return;
    }

    // --- path B: create new player -------------------------------------------
    if (room.players.length >= 2) {
      socket.emit("room_joined", { success: false, message: "Room is full." });
      return;
    }

    const normalizedNameLower = normalizedName.toLowerCase();
    if (room.players.some((p) => p.name.toLowerCase() === normalizedNameLower)) {
      socket.emit("room_joined", {
        success: false,
        message: "That name is already in use for this room.",
      });
      return;
    }

    const player: Player = {
      id: generatePlayerId(room),
      name: normalizedName,
      position: "G",
      socketId: socket.id,
    };
    room.players.push(player);
    await matchEngine.saveRoom(roomId);
    socket.to(roomId).emit("player_connected", player);

    matchEngine.bindSocket(socket.id, roomId, player.id);
    const newSessionToken = issueSessionToken(roomId, player.id);

    socket.to(roomId).emit("room_updated", room);
    socket.emit("room_joined", {
      success: true,
      message: `Successfully joined room ${roomId}`,
      roomState: room,
      playerToken: newSessionToken,
      playerId: player.id,
    });

    await matchEngine.start(roomId);
  });

  // ---------------------------------------------------------------------------
  // leave_room
  // ---------------------------------------------------------------------------
  socket.on("leave_room", (data: LeaveRoomRequest) => {
    let actor;
    try {
      actor = authorizer.authorize(socket.id, data.playerToken, data.roomId);
    } catch (error) {
      respondWithError(socket, error);
      return;
    }

    socket.leave(actor.roomId);
    matchEngine.removeSocketBinding(socket.id);
    matchEngine.clearDisconnectGraceTimer(actor.roomId, actor.playerId);
    matchEngine.removePlayer(actor.roomId, actor.playerId, "left");
  });
}

function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
