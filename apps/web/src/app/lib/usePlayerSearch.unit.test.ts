import { describe, expect, it } from "vitest";
import type { Player } from "@repo/types";
import { filterSearchResults } from "./usePlayerSearch";

const player = (id: number, seasons?: number[]): Player => ({
  id,
  name: `Player ${id}`,
  position: "SG",
  seasons,
});

describe("filterSearchResults", () => {
  it("filters out already-used players", () => {
    const results = [player(1), player(2), player(3)];
    const filtered = filterSearchResults(results, {
      usedPlayerIds: [1, 3],
    });
    expect(filtered.map((p) => p.id)).toEqual([2]);
  });

  it("filters out players without a season inside the window", () => {
    const results = [player(1, [1990, 1995]), player(2, [2000]), player(3, [])];
    const filtered = filterSearchResults(results, {
      usedPlayerIds: [],
      seasonYearMin: 1998,
      seasonYearMax: 2005,
    });
    expect(filtered.map((p) => p.id)).toEqual([2, 3]);
  });

  it("keeps players without season data as server fallback", () => {
    const results = [{ id: 1, name: "No Data", position: "C" }];
    const filtered = filterSearchResults(results, {
      usedPlayerIds: [],
      seasonYearMin: 1998,
      seasonYearMax: 2005,
    });
    expect(filtered).toHaveLength(1);
  });

  it("keeps everything when no window is set", () => {
    const results = [player(1, [1990]), player(2)];
    const filtered = filterSearchResults(results, { usedPlayerIds: [] });
    expect(filtered).toHaveLength(2);
  });
});
