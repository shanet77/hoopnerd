import { afterEach, describe, expect, it, vi } from "vitest";

const mockPool = vi.fn();

vi.mock("pg", () => ({
  Pool: mockPool,
}));

describe("@repo/database", () => {
  beforeEach(() => {
    vi.spyOn(process, "loadEnvFile").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    mockPool.mockReset();
    delete process.env.DATABASE_URL;
    delete process.env.NODE_ENV;
  });

  it("creates a pool with connection string when DATABASE_URL is set", async () => {
    process.env.DATABASE_URL = "postgres://example";
    await import("../index");

    expect(mockPool).toHaveBeenCalledWith({
      connectionString: "postgres://example",
    });
  });

  it("uses test database name in test environment", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.DATABASE_URL;
    await import("../index");

    expect(mockPool).toHaveBeenCalledWith(
      expect.objectContaining({
        database: "connectaball_test",
      })
    );
  });
});
