import { describe, it, expect, jest } from "@jest/globals";
import { PlayerService, DatabaseService } from "..";

jest.spyOn(global.console, "log");

describe("@repo/types", () => {
  it("prints a message", () => {
    console.log("hello");
    expect(console.log).toHaveBeenCalled();
  });
});
