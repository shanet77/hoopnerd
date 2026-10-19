import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Player, PlayerConnection } from "@repo/types";
import { ChainBoard } from "./ChainBoard";

const player = (id: number, name: string): Player => ({
  id,
  name,
  position: "SG",
});

const bullsConnection: PlayerConnection = {
  fromPlayer: player(1, "Michael Jordan"),
  toPlayer: player(2, "Scottie Pippen"),
  teamName: "Bulls",
  seasonYear: 1996,
};

const renderChain = (connections: PlayerConnection[]) =>
  render(
    <ChainBoard
      startingPlayer={player(1, "Michael Jordan")}
      connections={connections}
    />,
  );

describe("ChainBoard team accents", () => {
  it("colors the team caption and connector arrow with the team color", () => {
    const { container } = renderChain([bullsConnection]);

    expect(screen.getByText("Bulls · 1996")).toHaveStyle({ color: "#ce1141" });

    const arrow = container.querySelector("svg");
    expect(arrow).toHaveStyle({ color: "#ce1141" });
  });

  it("falls back to the neutral arrow when a connection has no team", () => {
    const { container } = renderChain([
      { ...bullsConnection, teamName: undefined, seasonYear: undefined },
    ]);

    expect(container.querySelector("svg")?.getAttribute("style")).toBeNull();
  });
});
