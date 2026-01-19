import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { validateMove } from "../index";

// Mock DatabaseService
const mockDb: any = {
  query: jest.fn(),
};

describe("validateMove", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return false if one or both players don't exist", async () => {
    // Mock the players check query to return count < 2
    (mockDb.query as jest.Mock).mockResolvedValueOnce({
      rows: [{ count: "1" }] // Only one player exists
    });

    const result = await validateMove(mockDb, 1, 2);

    expect(result).toBe(false);
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("SELECT COUNT(*)"),
      [1, 2]
    );
  });

  it("should return true if players played together in the same season on the same team", async () => {
    // Mock the players check query to return count = 2
    (mockDb.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [{ count: "2" }] // Both players exist
      })
      .mockResolvedValueOnce({
        rows: [{ season_year: 2020, team_id: 1 }] // Found shared team/season
      });

    const result = await validateMove(mockDb, 1, 2);

    expect(result).toBe(true);
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("SELECT COUNT(*)"),
      [1, 2]
    );
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringMatching(/rosters r1[\s\S]*JOIN[\s\S]*rosters r2/),
      [1, 2]
    );
  });

  it("should return false if players never played together", async () => {
    // Mock the players check query to return count = 2
    (mockDb.query as jest.Mock)
      .mockResolvedValueOnce({
        rows: [{ count: "2" }] // Both players exist
      })
      .mockResolvedValueOnce({
        rows: [] // No shared team/season found
      });

    const result = await validateMove(mockDb, 1, 2);

    expect(result).toBe(false);
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("SELECT COUNT(*)"),
      [1, 2]
    );
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringMatching(/rosters r1[\s\S]*JOIN[\s\S]*rosters r2/),
      [1, 2]
    );
  });

  it("should handle database errors gracefully", async () => {
    (mockDb.query as jest.Mock).mockRejectedValue(new Error("DB Error"));

    await expect(validateMove(mockDb, 1, 2)).rejects.toThrow("DB Error");
  });
});