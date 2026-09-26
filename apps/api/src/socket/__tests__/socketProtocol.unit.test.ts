import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Socket } from "socket.io";
import { AuthError, AuthErrorCode } from "../SessionAuthorizer";
import {
  ValidationError,
  requirePlayerName,
  respondWithError,
} from "../socketProtocol";

vi.mock("../../socketAuth", () => ({
  normalizePlayerName: vi.fn((name: string) => name.trim().replace(/\s+/g, " ")),
  MAX_PLAYER_NAME_LENGTH: 32,
}));

import { normalizePlayerName } from "../../socketAuth";

const mockNormalize = normalizePlayerName as vi.Mock;

describe("requirePlayerName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the normalized name", () => {
    expect(requirePlayerName("  Tim   Duncan  ")).toBe("Tim Duncan");
  });

  it("throws for an empty name", () => {
    mockNormalize.mockReturnValueOnce("");
    expect(() => requirePlayerName("   ")).toThrowError(ValidationError);
  });

  it("throws for an over-long name", () => {
    mockNormalize.mockReturnValueOnce("a".repeat(33));
    expect(() => requirePlayerName("a".repeat(33))).toThrowError(
      ValidationError,
    );
  });

  it("throws for a non-string name", () => {
    expect(() => requirePlayerName(undefined)).toThrowError(ValidationError);
  });
});

describe("respondWithError", () => {
  const emit = vi.fn();
  const socket = { emit } as unknown as Socket;

  beforeEach(() => {
    emit.mockClear();
  });

  it("emits auth_error for an AuthError", () => {
    respondWithError(socket, new AuthError(AuthErrorCode.INVALID_TOKEN, "bad"));

    expect(emit).toHaveBeenCalledWith("auth_error", {
      code: AuthErrorCode.INVALID_TOKEN,
      message: "bad",
    });
  });

  it("emits validation_error for a ValidationError", () => {
    respondWithError(socket, new ValidationError("INVALID_NAME", "nope"));

    expect(emit).toHaveBeenCalledWith("validation_error", {
      code: "INVALID_NAME",
      message: "nope",
    });
  });

  it("falls back to game_error for anything else", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    respondWithError(socket, new Error("boom"));

    expect(emit).toHaveBeenCalledWith(
      "game_error",
      "An internal server error occurred.",
    );
    consoleSpy.mockRestore();
  });
});
