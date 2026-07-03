import { describe, expect, it, vi } from "vitest";
import {
  createRoom,
  joinMatchmaking,
  joinRoom,
  leaveRoom,
  submitMove,
} from "./socket";

type Handler = (...args: any[]) => void;

const createMockSocket = () => {
  const onceHandlers = new Map<string, Handler>();
  const pendingEvents: Array<{ event: string; payload?: any }> = [];
  const socket = {
    once: vi.fn((event: string, handler: Handler) => {
      onceHandlers.set(event, handler);
      // Check if there's a pending emit for this event and trigger the handler
      const pendingIndex = pendingEvents.findIndex((p) => {
        const expectedResponseEvent = getExpectedResponseEvent(p.event);
        return expectedResponseEvent === event;
      });
      if (pendingIndex !== -1) {
        const pending = pendingEvents[pendingIndex];
        pendingEvents.splice(pendingIndex, 1);
        // Call handler with appropriate response based on the emitted event
        if (pending.event === "submit_move") {
          handler({ success: true, message: "submitted", validated: true });
        } else if (pending.event === "create_room") {
          handler({ success: true, message: "created", roomId: "ROOM1" });
        } else if (pending.event === "join_matchmaking") {
          handler({
            success: true,
            message: "joined",
            roomId: "ROOM2",
            joinedExisting: true,
          });
        } else if (pending.event === "join_room") {
          handler({ success: true, message: "ok", roomState: { roomId: pending.payload?.roomId } });
        }
      }
      return socket;
    }),
    off: vi.fn((event: string) => {
      onceHandlers.delete(event);
      return socket;
    }),
    emit: vi.fn((event: string, payload?: any) => {
      // Store the emit for when handler is registered later
      pendingEvents.push({ event, payload });
      // Also try to call handler immediately if already registered
      const expectedResponseEvent = getExpectedResponseEvent(event);
      if (expectedResponseEvent) {
        const cb = onceHandlers.get(expectedResponseEvent);
        if (cb) {
          if (event === "join_room") {
            cb({ success: true, message: "ok", roomState: { roomId: payload.roomId } });
          } else if (event === "submit_move") {
            cb({ success: true, message: "submitted", validated: true });
          } else if (event === "create_room") {
            cb({ success: true, message: "created", roomId: "ROOM1" });
          } else if (event === "join_matchmaking") {
            cb({
              success: true,
              message: "joined",
              roomId: "ROOM2",
              joinedExisting: true,
            });
          }
        }
      }
      return socket;
    }),
  };
  return socket as any;
};

const getExpectedResponseEvent = (emitEvent: string): string | null => {
  switch (emitEvent) {
    case "join_room":
      return "room_joined";
    case "submit_move":
      return "move_submitted";
    case "create_room":
      return "room_created";
    case "join_matchmaking":
      return "matchmaking_result";
    default:
      return null;
  }
};

describe("socket helpers", () => {
  it("joins room using promise wrapper", async () => {
    const socket = createMockSocket();
    await expect(
      joinRoom(socket, { roomId: "ROOM1", playerName: "Tim" })
    ).resolves.toEqual(
      expect.objectContaining({
        success: true,
      })
    );
  });

  it("submits move with promise wrapper", async () => {
    const socket = createMockSocket();
    await expect(
      submitMove(socket, {
        roomId: "ROOM1",
        playerToken: "token",
        connectedPlayer: { id: 2, name: "Tony", position: "PG" },
      })
    ).resolves.toEqual(expect.objectContaining({ success: true }));
  });

  it("creates room and joins matchmaking", async () => {
    const socket = createMockSocket();
    await expect(createRoom(socket, false)).resolves.toEqual(
      expect.objectContaining({ roomId: "ROOM1" })
    );
    await expect(
      joinMatchmaking(socket, { playerName: "Tim", friendsOnly: false })
    ).resolves.toEqual(expect.objectContaining({ roomId: "ROOM2" }));
  });

  it("emits leave room without response handling", () => {
    const socket = createMockSocket();
    leaveRoom(socket, { roomId: "ROOM3", playerToken: "token" });
    expect(socket.emit).toHaveBeenCalledWith("leave_room", {
      roomId: "ROOM3",
      playerToken: "token",
    });
  });
});
