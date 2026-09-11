import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getConnectionDetails,
  getPlayerById,
  validateMove,
} from "../index";

const mockRepo = {
  validateMove: vi.fn(),
  getConnectionDetails: vi.fn(),
  getPlayerById: vi.fn(),
} as any;

describe("@repo/logic delegates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validateMove delegates to repo", async () => {
    mockRepo.validateMove.mockResolvedValue(true);
    await expect(validateMove(mockRepo, 1, 2)).resolves.toBe(true);
    expect(mockRepo.validateMove).toHaveBeenCalledWith(1, 2, undefined, undefined);
  });

  it("getConnectionDetails delegates to repo", async () => {
    const details = {
      fromPlayer: { id: 1, name: "Tim", position: "PF" },
      toPlayer: { id: 2, name: "Tony", position: "PG" },
      seasonYear: 2005,
      teamName: "Spurs",
    };
    mockRepo.getConnectionDetails.mockResolvedValue(details);
    await expect(getConnectionDetails(mockRepo, 1, 2)).resolves.toEqual(details);
  });

  it("getPlayerById delegates to repo", async () => {
    const player = { id: 7, name: "David Robinson", position: "C" };
    mockRepo.getPlayerById.mockResolvedValue(player);
    await expect(getPlayerById(mockRepo, 7)).resolves.toEqual(player);
  });

  it("bubbles errors from repo", async () => {
    mockRepo.validateMove.mockRejectedValue(new Error("DB down"));
    await expect(validateMove(mockRepo, 1, 2)).rejects.toThrow("DB down");
  });
});
