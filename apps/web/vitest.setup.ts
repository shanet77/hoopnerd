import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom implements neither ResizeObserver (used by PlayerGraph to size its
// canvas) nor the 2d canvas context. PlayerGraph already guards a null
// context, so only ResizeObserver needs a stub.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver;
}

afterEach(() => {
  cleanup();
});
