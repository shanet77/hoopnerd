import { describe, expect, it, jest } from "@jest/globals";

const nextFn = jest.fn(() => ({ type: "next" }));
const rewriteFn = jest.fn((url: unknown) => ({ type: "rewrite", url }));

jest.mock("next/server", () => ({
  NextResponse: {
    next: nextFn,
    rewrite: rewriteFn,
  },
}));

describe("middleware", () => {
  it("passes through non-graph host", async () => {
    const { middleware } = await import("./middleware");
    const response = middleware({
      headers: { get: () => "localhost:3000" },
      nextUrl: {
        pathname: "/",
        clone: () => ({ pathname: "/" }),
      },
    } as any);

    expect(nextFn).toHaveBeenCalled();
    expect(response).toEqual({ type: "next" });
  });

  it("rewrites graph host root route", async () => {
    const { middleware } = await import("./middleware");
    const cloneValue = { pathname: "/" as string };
    const response = middleware({
      headers: { get: () => "graph.hoopnerd.xyz" },
      nextUrl: {
        pathname: "/",
        clone: () => cloneValue,
      },
    } as any);

    expect(cloneValue.pathname).toBe("/graph");
    expect(rewriteFn).toHaveBeenCalled();
    expect(response).toEqual({ type: "rewrite", url: cloneValue });
  });
});
