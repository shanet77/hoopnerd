import { afterEach, describe, expect, it, jest } from "@jest/globals";
import {
  generatePlayerId,
  issueSessionToken,
  MAX_PLAYER_NAME_LENGTH,
  normalizePlayerName,
  verifySessionToken,
} from "../socketAuth";
import { createGameRoom } from "../serverUtils";

describe("socketAuth", () => {
  afterEach(() => {
    delete process.env.SOCKET_SESSION_SECRET;
  });

  it("normalizes player names", () => {
    expect(normalizePlayerName("  Tim   Duncan  ")).toBe("Tim Duncan");
    expect(MAX_PLAYER_NAME_LENGTH).toBeGreaterThan(0);
  });

  it("issues and verifies a valid session token", () => {
    process.env.SOCKET_SESSION_SECRET = "test-secret";
    const token = issueSessionToken("ROOM1", 42);
    const claims = verifySessionToken(token);

    expect(claims).not.toBeNull();
    expect(claims?.roomId).toBe("ROOM1");
    expect(claims?.playerId).toBe(42);
    expect(claims?.exp).toBeGreaterThan(claims?.iat ?? 0);
  });

  it("rejects tampered token signature", () => {
    process.env.SOCKET_SESSION_SECRET = "test-secret";
    const token = issueSessionToken("ROOM1", 42);
    const [header, payload] = token.split(".");
    const tampered = `${header}.${payload}.invalidsig`;
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it("generates unique player IDs for a room", () => {
    const room = createGameRoom("ROOMX");
    room.players.push({ id: 11, name: "A", position: "G" });
    room.players.push({ id: 22, name: "B", position: "F" });

    const id = generatePlayerId(room);
    expect(id).not.toBe(11);
    expect(id).not.toBe(22);
  });

  it("rejects expired tokens", () => {
    process.env.SOCKET_SESSION_SECRET = "test-secret";
    jest.useFakeTimers();
    const now = new Date("2026-01-01T00:00:00.000Z");
    jest.setSystemTime(now);
    const token = issueSessionToken("ROOM1", 42);

    jest.setSystemTime(new Date(now.getTime() + 1000 * 60 * 60 * 13));
    expect(verifySessionToken(token)).toBeNull();
    jest.useRealTimers();
  });
});
