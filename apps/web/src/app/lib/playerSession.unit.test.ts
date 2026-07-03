import { describe, expect, it } from "vitest";
import {
  clearPlayerSession,
  getPlayerName,
  getPlayerSession,
  setPlayerName,
  setPlayerSession,
} from "./playerSession";

describe("playerSession", () => {
  it("stores and retrieves a session with normalized key", () => {
    setPlayerSession("room1", " Tim Duncan ", {
      token: "token-1",
      playerId: 7,
    });

    expect(getPlayerSession("ROOM1", "tim duncan")).toEqual({
      token: "token-1",
      playerId: 7,
    });
  });

  it("clears a stored session", () => {
    setPlayerSession("room2", "Tony Parker", {
      token: "token-2",
      playerId: 9,
    });
    clearPlayerSession("room2", "Tony Parker");
    expect(getPlayerSession("room2", "Tony Parker")).toBeUndefined();
  });

  describe("player name persistence", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it("stores and retrieves a player name", () => {
      setPlayerName("  LeBron James  ");
      expect(getPlayerName()).toBe("LeBron James");
    });

    it("returns empty string when no name is stored", () => {
      expect(getPlayerName()).toBe("");
    });

    it("removes the name when setting an empty or whitespace-only value", () => {
      setPlayerName("Steph Curry");
      expect(getPlayerName()).toBe("Steph Curry");

      setPlayerName("");
      expect(getPlayerName()).toBe("");

      setPlayerName("   ");
      expect(getPlayerName()).toBe("");
    });

    it("overwrites a previously stored name", () => {
      setPlayerName("Kobe Bryant");
      setPlayerName("Shaq");
      expect(getPlayerName()).toBe("Shaq");
    });
  });
});
