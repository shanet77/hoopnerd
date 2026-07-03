import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeToggle } from "./ThemeToggle";

const setThemeMock = vi.fn();

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "light",
    setTheme: (theme: string) => setThemeMock(theme),
  }),
}));

describe("ThemeToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the moon icon in light mode", () => {
    render(<ThemeToggle />);
    // After mount, light mode shows moon icon
    const button = screen.getByRole("button", { name: /switch to dark mode/i });
    expect(button).toBeInTheDocument();
    // SVG should be present
    expect(button.querySelector("svg")).toBeInTheDocument();
  });

  it("calls setTheme on click", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: /switch to dark mode/i });
    fireEvent.click(button);
    expect(setThemeMock).toHaveBeenCalledWith("dark");
  });

  it("has correct accessibility attributes", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-label");
  });
});
