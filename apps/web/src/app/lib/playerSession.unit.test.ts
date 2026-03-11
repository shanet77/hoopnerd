import { describe, expect, it } from "@jest/globals";
import {
  clearPlayerSession,
  getPlayerSession,
  setPlayerSession,
} from "./playerSession";

describe("playerSession", () => {
  it("stores and retrieves a session with normalized key", () => {
    setPlayerSession("room1", " Tim Duncan ", {
      token: "token-1",
      playerId: 7,
    });

    expect(getPlayerSession("ROOM1", "tim duncan")).toEqual({
      token: "token-1",
      playerId: 7,
    });
  });

  it("clears a stored session", () => {
    setPlayerSession("room2", "Tony Parker", {
      token: "token-2",
      playerId: 9,
    });
    clearPlayerSession("room2", "Tony Parker");
    expect(getPlayerSession("room2", "Tony Parker")).toBeUndefined();
  });
});
