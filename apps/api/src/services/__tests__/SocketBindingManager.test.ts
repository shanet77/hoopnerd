import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { SocketBindingManager } from "../SocketBindingManager";

describe("SocketBindingManager", () => {
  let manager: SocketBindingManager;
  let disconnectMock: vi.Mock;
  let onExpiredMock: vi.Mock;
  const defaultGraceMs = 500;

  beforeEach(() => {
    vi.useFakeTimers();
    disconnectMock = vi.fn();
    onExpiredMock = vi.fn();

    manager = new SocketBindingManager(
      disconnectMock,
      onExpiredMock,
      defaultGraceMs,
    );
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should use provided disconnectGraceMs", () => {
      const expiredMock = vi.fn();
      const mgr = new SocketBindingManager(disconnectMock, expiredMock, 3000);
      mgr.bindSocket("s1", "room1", 1);
      mgr.handleDisconnect("s1");

      vi.advanceTimersByTime(2000);
      expect(expiredMock).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1001);
      expect(expiredMock).toHaveBeenCalledWith("room1", 1);
    });

    it("should default to 10000ms when no env var and no arg", () => {
      const mgr = new SocketBindingManager(disconnectMock, onExpiredMock);
      mgr.bindSocket("s1", "room1", 1);
      mgr.handleDisconnect("s1");

      vi.advanceTimersByTime(9000);
      expect(onExpiredMock).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1001);
      expect(onExpiredMock).toHaveBeenCalledWith("room1", 1);
    });
  });

  describe("bindSocket", () => {
    it("should bind socket to room and player", () => {
      manager.bindSocket("socket-1", "roomA", 42);

      expect(manager.getSocketBinding("socket-1")).toEqual({
        roomId: "roomA",
        playerId: 42,
      });
    });

    it("should clear disconnect grace timer when binding", () => {
      manager.bindSocket("socket-1", "roomA", 1);
      manager.handleDisconnect("socket-1");

      manager.bindSocket("socket-2", "roomA", 1);

      vi.advanceTimersByTime(defaultGraceMs + 100);
      expect(onExpiredMock).not.toHaveBeenCalled();
    });

    it("should disconnect stale socket for same player in same room", () => {
      manager.bindSocket("old-socket", "roomA", 1);
      manager.bindSocket("new-socket", "roomA", 1);

      expect(disconnectMock).toHaveBeenCalledWith("old-socket");
      expect(manager.getSocketBinding("old-socket")).toBeUndefined();
      expect(manager.getSocketBinding("new-socket")).toEqual({
        roomId: "roomA",
        playerId: 1,
      });
    });

    it("should not disconnect stale socket from different room", () => {
      manager.bindSocket("old-socket", "roomA", 1);
      manager.bindSocket("new-socket", "roomB", 1);

      expect(disconnectMock).not.toHaveBeenCalled();
      expect(manager.getSocketBinding("old-socket")).toEqual({
        roomId: "roomA",
        playerId: 1,
      });
    });

    it("should not disconnect stale socket for different player", () => {
      manager.bindSocket("old-socket", "roomA", 1);
      manager.bindSocket("new-socket", "roomA", 2);

      expect(disconnectMock).not.toHaveBeenCalled();
      expect(manager.getSocketBinding("old-socket")).toEqual({
        roomId: "roomA",
        playerId: 1,
      });
    });
  });

  describe("getSocketBinding", () => {
    it("should return undefined for unknown socket", () => {
      expect(manager.getSocketBinding("nonexistent")).toBeUndefined();
    });

    it("should return binding for known socket", () => {
      manager.bindSocket("socket-1", "roomA", 1);

      expect(manager.getSocketBinding("socket-1")).toEqual({
        roomId: "roomA",
        playerId: 1,
      });
    });
  });

  describe("removeSocketBinding", () => {
    it("should remove socket binding", () => {
      manager.bindSocket("socket-1", "roomA", 1);
      manager.removeSocketBinding("socket-1");

      expect(manager.getSocketBinding("socket-1")).toBeUndefined();
    });

    it("should be a no-op for unknown socket", () => {
      expect(() => manager.removeSocketBinding("nonexistent")).not.toThrow();
    });
  });

  describe("handleDisconnect", () => {
    it("should do nothing for unknown socket", () => {
      manager.handleDisconnect("nonexistent");
    });

    it("should remove binding immediately on disconnect", () => {
      manager.bindSocket("socket-1", "roomA", 1);
      manager.handleDisconnect("socket-1");

      expect(manager.getSocketBinding("socket-1")).toBeUndefined();
    });

    it("should call onExpired after grace period if no rebind", () => {
      manager.bindSocket("socket-1", "roomA", 1);
      manager.handleDisconnect("socket-1");

      vi.advanceTimersByTime(defaultGraceMs + 100);

      expect(onExpiredMock).toHaveBeenCalledWith("roomA", 1);
    });

    it("should not call onExpired if player rebound within grace period", () => {
      manager.bindSocket("socket-1", "roomA", 1);
      manager.handleDisconnect("socket-1");

      manager.bindSocket("socket-2", "roomA", 1);

      vi.advanceTimersByTime(defaultGraceMs + 100);

      expect(onExpiredMock).not.toHaveBeenCalled();
    });

    it("should not call onExpired if any socket still bound for same player/room", () => {
      manager.bindSocket("socket-1", "roomA", 1);
      manager.bindSocket("socket-2", "roomA", 1);

      manager.handleDisconnect("socket-1");

      vi.advanceTimersByTime(defaultGraceMs + 100);

      expect(onExpiredMock).not.toHaveBeenCalled();
    });

    it("should restart grace timer on second disconnect for same player", () => {
      manager.bindSocket("socket-1", "roomA", 1);
      manager.handleDisconnect("socket-1");

      vi.advanceTimersByTime(defaultGraceMs / 2);

      manager.bindSocket("socket-2", "roomA", 1);
      manager.handleDisconnect("socket-2");

      // First timer was cleared by rebind; second timer needs its full grace
      vi.advanceTimersByTime(defaultGraceMs - 50);
      expect(onExpiredMock).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(onExpiredMock).toHaveBeenCalledTimes(1);
      expect(onExpiredMock).toHaveBeenCalledWith("roomA", 1);
    });
  });

  describe("clearDisconnectGraceTimer", () => {
    it("should clear a pending disconnect grace timer", () => {
      manager.bindSocket("socket-1", "roomA", 1);
      manager.handleDisconnect("socket-1");

      manager.clearDisconnectGraceTimer("roomA", 1);

      vi.advanceTimersByTime(defaultGraceMs + 100);
      expect(onExpiredMock).not.toHaveBeenCalled();
    });

    it("should be a no-op when no timer exists", () => {
      expect(() => manager.clearDisconnectGraceTimer("roomA", 1)).not.toThrow();
    });
  });

  describe("integration: disconnect and rebind", () => {
    it("should not expire after disconnect+rebind (rebound within grace)", () => {
      manager.bindSocket("s1", "roomA", 1);
      manager.handleDisconnect("s1");
      // Rebind within grace period
      manager.bindSocket("s2", "roomA", 1);

      vi.advanceTimersByTime(defaultGraceMs + 100);

      expect(onExpiredMock).not.toHaveBeenCalled();
    });

    it("should expire after disconnect+rebind+final disconnect with no rebind", () => {
      manager.bindSocket("s1", "roomA", 1);
      manager.handleDisconnect("s1");
      manager.bindSocket("s2", "roomA", 1);
      // Second disconnect, no rebind
      manager.handleDisconnect("s2");

      vi.advanceTimersByTime(defaultGraceMs + 100);

      expect(onExpiredMock).toHaveBeenCalledTimes(1);
      expect(onExpiredMock).toHaveBeenCalledWith("roomA", 1);
    });

    it("should not expire after multiple disconnect/rebind cycles ending in rebind", () => {
      manager.bindSocket("s1", "roomA", 1);
      manager.handleDisconnect("s1");
      manager.bindSocket("s2", "roomA", 1);
      manager.handleDisconnect("s2");
      manager.bindSocket("s3", "roomA", 1);

      vi.advanceTimersByTime(defaultGraceMs + 100);

      expect(onExpiredMock).not.toHaveBeenCalled();
    });
  });
});
