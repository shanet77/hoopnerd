import { describe, it, expect, jest } from "@jest/globals";

jest.spyOn(global.console, "log");

describe("@repo/database", () => {
  it("prints a message", () => {
    console.log("hello");
    expect(console.log).toHaveBeenCalled();
  });
});
