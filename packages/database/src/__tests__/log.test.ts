import { afterEach, describe, expect, it, jest } from "@jest/globals";

const mockPool = jest.fn();
const mockConfig = jest.fn();

jest.mock("pg", () => ({
  Pool: mockPool,
}));

jest.mock("dotenv", () => ({
  config: mockConfig,
}));

describe("@repo/database", () => {
  afterEach(() => {
    jest.resetModules();
    mockPool.mockReset();
    mockConfig.mockReset();
    delete process.env.DATABASE_URL;
    delete process.env.NODE_ENV;
  });

  it("creates a pool with connection string when DATABASE_URL is set", async () => {
    process.env.DATABASE_URL = "postgres://example";
    await import("../index.js");

    expect(mockConfig).toHaveBeenCalled();
    expect(mockPool).toHaveBeenCalledWith({
      connectionString: "postgres://example",
    });
  });

  it("uses test database name in test environment", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.DATABASE_URL;
    await import("../index.js");

    expect(mockPool).toHaveBeenCalledWith(
      expect.objectContaining({
        database: "connectaball_test",
      })
    );
  });
});
