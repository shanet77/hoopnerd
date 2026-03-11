import { describe, expect, it } from "@jest/globals";
import {
  buildAllowedOrigins,
  createGameRoom,
  hasPlayerBeenUsed,
  isOriginAllowed,
  parseAllowedOrigins,
  parseTimezone,
  parseWindowDays,
} from "../serverUtils";

describe("serverUtils", () => {
  it("parses and trims allowed origins", () => {
    expect(
      parseAllowedOrigins(" https://a.com,https://b.com ,, https://c.com ")
    ).toEqual(["https://a.com", "https://b.com", "https://c.com"]);
  });

  it("builds wildcard origins for non-production", () => {
    expect(buildAllowedOrigins("development", undefined)).toEqual(["*"]);
  });

  it("builds configured origins in production", () => {
    expect(
      buildAllowedOrigins("production", "https://a.com,https://b.com")
    ).toEqual(["https://a.com", "https://b.com"]);
  });

  it("allows missing origin and wildcard", () => {
    expect(isOriginAllowed(["*"], undefined)).toBe(true);
    expect(isOriginAllowed(["*"], "https://x.com")).toBe(true);
  });

  it("restricts origin list when wildcard absent", () => {
    expect(isOriginAllowed(["https://a.com"], "https://a.com")).toBe(true);
    expect(isOriginAllowed(["https://a.com"], "https://b.com")).toBe(false);
  });

  it("parses stats window days with bounds", () => {
    expect(parseWindowDays(undefined)).toBe(7);
    expect(parseWindowDays("not-a-number")).toBe(7);
    expect(parseWindowDays("0")).toBe(1);
    expect(parseWindowDays("999")).toBe(365);
    expect(parseWindowDays("14")).toBe(14);
  });

  it("parses timezone fallback and trims input", () => {
    expect(parseTimezone(undefined)).toBe("America/New_York");
    expect(parseTimezone("   ")).toBe("America/New_York");
    expect(parseTimezone(" America/Chicago ")).toBe("America/Chicago");
  });

  it("creates a fresh game room and tracks used players", () => {
    const room = createGameRoom("ROOM1", true);
    expect(room.roomId).toBe("ROOM1");
    expect(room.friendsOnly).toBe(true);
    expect(room.players).toHaveLength(0);
    expect(room.moves).toHaveLength(0);

    room.startingPlayer = { id: 1, name: "A", position: "G" };
    room.moves.push({ playerId: 2, playerName: "B", position: "F" });
    expect(hasPlayerBeenUsed(room, 1)).toBe(true);
    expect(hasPlayerBeenUsed(room, 2)).toBe(true);
    expect(hasPlayerBeenUsed(room, 3)).toBe(false);
  });
});
