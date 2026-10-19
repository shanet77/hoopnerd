import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

const datasetsDir = path.resolve(__dirname, "../../../../datasets");
const file = JSON.parse(
  fs.readFileSync(path.join(datasetsDir, "transactions_2026-offseason.json"), "utf-8")
);
const { getTeamName } = require(path.join(datasetsDir, "team_abbreviation_map.js"));

interface Move {
  player: string;
  team: string;
  type: string;
}

describe("2026 offseason dataset", () => {
  it("targets the 2026-27 season (season_year 2027)", () => {
    expect(file.seasonYear).toBe(2027);
  });

  it("lists each player exactly once", () => {
    const names = file.moves.map((move: Move) => move.player.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("only references known NBA team abbreviations", () => {
    for (const move of file.moves as Move[]) {
      expect(getTeamName(move.team), `${move.player} -> ${move.team}`).not.toBe(move.team);
    }
  });

  it("only uses supported move types", () => {
    const allowed = new Set(["draft", "trade", "free-agent", "re-sign", "waiver"]);
    for (const move of file.moves as Move[]) {
      expect(allowed.has(move.type), `${move.player}: ${move.type}`).toBe(true);
    }
  });

  it("gives every draft pick a number and a position", () => {
    const picks = (file.moves as (Move & { pick?: number; position?: string })[]).filter(
      (move) => move.type === "draft"
    );
    expect(picks).toHaveLength(60);
    expect(new Set(picks.map((move) => move.pick)).size).toBe(60);
    expect(picks.every((move) => Boolean(move.position))).toBe(true);
  });
});
