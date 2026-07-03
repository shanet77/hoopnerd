import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

describe("analytics", () => {
  beforeEach(() => {
    vi.resetModules();
    delete (global as any).window;
  });

  afterEach(() => {
    warnSpy.mockClear();
  });

  it("does not throw when umami is disabled", async () => {
    const { trackEvent, trackPageview } = await import("./analytics");
    expect(() => trackEvent("event")).not.toThrow();
    expect(() => trackPageview()).not.toThrow();
  });

  it("warns when umami is enabled but missing", async () => {
    process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID = "cacf2f84-0344-43eb-b0ee-f5c7dd0e0f65";
    (global as any).window = {};

    const { trackEvent } = await import("./analytics");
    trackEvent("room_created", { mode: "public" });

    expect(warnSpy).toHaveBeenCalled();
    delete process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  });
});
