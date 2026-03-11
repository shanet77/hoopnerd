import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

describe("analytics", () => {
  beforeEach(() => {
    jest.resetModules();
    delete (global as any).window;
  });

  afterEach(() => {
    warnSpy.mockClear();
  });

  it("does not throw when plausible is disabled", async () => {
    const { trackEvent, trackPageview } = await import("./analytics");
    expect(() => trackEvent("event")).not.toThrow();
    expect(() => trackPageview()).not.toThrow();
  });

  it("warns when plausible is enabled but missing", async () => {
    process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_SRC = "https://example.com/plausible.js";
    (global as any).window = {};

    const { trackEvent } = await import("./analytics");
    trackEvent("room_created", { mode: "public" });

    expect(warnSpy).toHaveBeenCalled();
    delete process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_SRC;
  });
});
