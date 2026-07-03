import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StatsResponse } from "@repo/types";
import { LeaderboardPanel } from "./LeaderboardPanel";

function MockImage(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} />;
}

vi.mock("next/image", () => ({
  __esModule: true,
  default: MockImage,
}));

function mockStats(overrides?: Partial<StatsResponse>): StatsResponse {
  return {
    windowDays: 7,
    timezone: "UTC",
    updatedAt: "2026-01-01T00:00:00.000Z",
    players: [
      { name: "LeBron James", count: 42 },
      { name: "Stephen Curry", count: 38 },
    ],
    teams: [
      { name: "Lakers", count: 55 },
      { name: "Warriors", count: 47 },
    ],
    seasons: [
      { seasonYear: 2025, count: 60 },
      { seasonYear: 2024, count: 51 },
    ],
    longestStreak: 12,
    ...overrides,
  };
}

describe("LeaderboardPanel", () => {
  it("shows Longest Streak and Players tab content by default when stats loaded", () => {
    render(<LeaderboardPanel stats={mockStats()} statsError={false} />);

    expect(screen.getByText(/longest streak/i)).toBeInTheDocument();
    expect(screen.getByText("12 connections")).toBeInTheDocument();

    // Players tab active → players list visible
    expect(screen.getByText("LeBron James")).toBeVisible();
    // Teams list not visible (hidden panel)
    expect(screen.getByText("Lakers")).not.toBeVisible();
    // Seasons list not visible
    expect(screen.getByText("2025")).not.toBeVisible();
  });

  it("clicking Teams tab shows teams list and hides players", () => {
    render(<LeaderboardPanel stats={mockStats()} statsError={false} />);

    fireEvent.click(screen.getByRole("tab", { name: "Teams" }));

    expect(screen.getByText("Lakers")).toBeVisible();
    expect(screen.getByText("LeBron James")).not.toBeVisible();
    expect(screen.getByText("2025")).not.toBeVisible();
  });

  it("clicking Seasons tab shows seasons list", () => {
    render(<LeaderboardPanel stats={mockStats()} statsError={false} />);

    fireEvent.click(screen.getByRole("tab", { name: "Seasons" }));

    // 2025 appears as a label (seasonYear) and a badge value — find the label in the list
    const seasonsPanel = screen.getByRole("tabpanel", { name: "Seasons" });
    expect(seasonsPanel).toBeVisible();
    expect(screen.getByText("2025")).toBeInTheDocument();

    expect(screen.getByText("LeBron James")).not.toBeVisible();
    expect(screen.getByText("Lakers")).not.toBeVisible();
  });

  it("shows loading message when no stats and no error", () => {
    render(<LeaderboardPanel stats={null} statsError={false} />);

    expect(screen.getByText(/loading stats/i)).toBeInTheDocument();
    expect(screen.queryByText("Longest Streak")).not.toBeInTheDocument();
  });

  it("shows error message when statsError is true", () => {
    render(<LeaderboardPanel stats={null} statsError={true} />);

    expect(screen.getByText(/stats currently unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText("Longest Streak")).not.toBeInTheDocument();
  });

  it("renders all three tab triggers", () => {
    render(<LeaderboardPanel stats={mockStats()} statsError={false} />);

    expect(screen.getByRole("tab", { name: "Players" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Teams" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Seasons" })).toBeInTheDocument();
  });
});
