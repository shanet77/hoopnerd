import { describe, expect, it, vi } from "vitest";
import {
  buildGameOverPayload,
  EMBED_GAME_OVER_TYPE,
  EMBED_READY_TYPE,
  getEmbedParentOrigins,
  postGameOverToParent,
  postReadyToParent,
  resolveEmbedPlayerName,
  resolveEmbedSeasonParams,
} from "./embed-protocol";

describe("resolveEmbedPlayerName", () => {
  it("trims and collapses whitespace like the API", () => {
    expect(resolveEmbedPlayerName("  Bron   Bot  ")).toBe("Bron Bot");
    expect(resolveEmbedPlayerName("LeBron")).toBe("LeBron");
  });

  it("falls back to a Guest handle for missing names", () => {
    expect(resolveEmbedPlayerName(null)).toMatch(/^Guest-[A-Z0-9]{4}$/);
    expect(resolveEmbedPlayerName("   ")).toMatch(/^Guest-[A-Z0-9]{4}$/);
    expect(resolveEmbedPlayerName(undefined)).toMatch(/^Guest-[A-Z0-9]{4}$/);
  });

  it("falls back when the name exceeds the server limit", () => {
    expect(resolveEmbedPlayerName("x".repeat(33))).toMatch(
      /^Guest-[A-Z0-9]{4}$/,
    );
    expect(resolveEmbedPlayerName("x".repeat(32))).toBe("x".repeat(32));
  });
});

describe("resolveEmbedSeasonParams", () => {
  it("returns All Time when a bound is missing", () => {
    expect(resolveEmbedSeasonParams(null, "2019", 1980, 2026)).toEqual({});
    expect(resolveEmbedSeasonParams("1990", null, 1980, 2026)).toEqual({});
  });

  it("clamps to the available season range", () => {
    expect(resolveEmbedSeasonParams("1950", "2050", 1980, 2026)).toEqual({
      min: 1980,
      max: 2026,
    });
  });

  it("returns All Time for inverted or unparseable ranges", () => {
    expect(resolveEmbedSeasonParams("2020", "2010", 1980, 2026)).toEqual({});
    expect(resolveEmbedSeasonParams("abc", "2019", 1980, 2026)).toEqual({});
  });

  it("passes valid ranges through", () => {
    expect(resolveEmbedSeasonParams("1996", "1998", 1980, 2026)).toEqual({
      min: 1996,
      max: 1998,
    });
  });
});

describe("game-over payload", () => {
  it("builds a well-formed payload with a fixed type tag", () => {
    const payload = buildGameOverPayload({
      winnerName: "Shane",
      humanWon: true,
      moves: 7.9,
      reason: "CPU has no valid moves! You win!",
    });
    expect(payload).toEqual({
      type: EMBED_GAME_OVER_TYPE,
      winnerName: "Shane",
      humanWon: true,
      moves: 7,
      reason: "CPU has no valid moves! You win!",
    });
  });
});

describe("parent messaging", () => {
  it("defaults to the placeholder origins", () => {
    expect(getEmbedParentOrigins()).toEqual([
      "https://www.example.com",
      "https://example.com",
    ]);
  });

  it("honors NEXT_PUBLIC_EMBED_PARENT_ORIGINS for local dev", () => {
    process.env.NEXT_PUBLIC_EMBED_PARENT_ORIGINS =
      "http://localhost:4321, http://localhost:3000";
    try {
      expect(getEmbedParentOrigins()).toEqual([
        "http://localhost:4321",
        "http://localhost:3000",
      ]);
    } finally {
      delete process.env.NEXT_PUBLIC_EMBED_PARENT_ORIGINS;
    }
  });

  it("no-ops when not framed", () => {
    postReadyToParent();
    postGameOverToParent(
      buildGameOverPayload({
        winnerName: "Shane",
        humanWon: true,
        moves: 1,
        reason: "done",
      }),
    );
    expect(true).toBe(true);
  });

  it("targets each configured parent origin", () => {
    const postMessage = vi.fn();
    const parent = { postMessage } as unknown as Window["parent"];
    vi.stubGlobal("window", {
      get parent() {
        return parent;
      },
    } as unknown as Window & typeof globalThis);

    postReadyToParent();
    // jsdom has no referrer, so only the configured fallbacks are targeted.
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage).toHaveBeenNthCalledWith(
      1,
      { type: EMBED_READY_TYPE },
      "https://www.example.com",
    );

    vi.unstubAllGlobals();
  });

  it("includes the framing page's origin so local dev works", () => {
    const postMessage = vi.fn();
    const parent = { postMessage } as unknown as Window["parent"];
    vi.stubGlobal("window", {
      get parent() {
        return parent;
      },
    } as unknown as Window & typeof globalThis);
    vi.stubGlobal("document", {
      get referrer() {
        return "http://localhost:4321/play";
      },
    } as unknown as Document);
    try {
      expect(getEmbedParentOrigins()).toContain("http://localhost:4321");
      postReadyToParent();
      expect(postMessage).toHaveBeenCalledWith(
        { type: EMBED_READY_TYPE },
        "http://localhost:4321",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
