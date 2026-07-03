import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "./theme";

// next-themes uses useLayoutEffect internally which needs to be mocked in jsdom
vi.mock("next-themes", () => ({
  ThemeProvider: ({ children, ...props }: any) => {
    // Capture props on the mock for assertion
    return (
      <div data-testid="next-themes-provider" data-props={JSON.stringify(props)}>
        {children}
      </div>
    );
  },
}));

describe("ThemeProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders children", () => {
    render(
      <ThemeProvider>
        <div data-testid="child">Hello</div>
      </ThemeProvider>,
    );
    expect(screen.getByTestId("child")).toHaveTextContent("Hello");
  });

  it("passes correct props to next-themes provider", () => {
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>,
    );
    const provider = screen.getByTestId("next-themes-provider");
    const props = JSON.parse(provider.getAttribute("data-props") || "{}");
    expect(props.attribute).toBe("class");
    expect(props.defaultTheme).toBe("system");
    expect(props.enableSystem).toBe(true);
    expect(props.disableTransitionOnChange).toBe(false);
  });
});
