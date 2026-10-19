import { describe, expect, it } from "vitest";
import { teamAccent } from "./teamColors";

describe("teamAccent", () => {
  it("returns the curated color for a known mascot", () => {
    expect(teamAccent("Bulls")).toBe("#ce1141");
  });

  it("resolves full team names to the mascot color", () => {
    expect(teamAccent("Portland Trail Blazers")).toBe("#e03a3e");
  });

  it("ignores case and surrounding whitespace", () => {
    expect(teamAccent("  bulls ")).toBe("#ce1141");
  });

  it("returns undefined when there is no team to key on", () => {
    expect(teamAccent(undefined)).toBeUndefined();
    expect(teamAccent("   ")).toBeUndefined();
  });

  it("gives unknown teams a stable hue instead of gray", () => {
    const first = teamAccent("Washington Capitols");
    expect(first).toMatch(/^hsl\(\d+ 62% 50%\)$/);
    expect(teamAccent("Washington Capitols")).toBe(first);
  });

  it("gives different unknown teams different hues", () => {
    expect(teamAccent("Washington Capitols")).not.toBe(
      teamAccent("Sheboygan Redskins"),
    );
  });
});
