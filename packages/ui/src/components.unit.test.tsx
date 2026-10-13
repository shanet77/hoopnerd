import React from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Badge } from "./badge";
import { Button } from "./button";
import { Input } from "./input";

describe("@repo/ui components", () => {
  it("renders button variants and handles click", () => {
    let clicked = false;
    render(
      <Button variant="success" onClick={() => (clicked = true)}>
        Submit
      </Button>
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(clicked).toBe(true);
    expect(screen.getByRole("button", { name: "Submit" })).toHaveClass("bg-success");
  });

  it("renders input with label, icon, and error", () => {
    render(
      <Input
        label="Player"
        icon={<span data-testid="icon">*</span>}
        error="Required"
        value=""
        onChange={() => undefined}
      />
    );

    expect(screen.getByText("Player")).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByText(/required/i)).toBeInTheDocument();
  });

  it("renders the basketball button variant", () => {
    render(<Button variant="basketball">Hoops</Button>);

    expect(screen.getByRole("button", { name: "Hoops" })).toHaveClass(
      "border-basketball",
    );
  });

  it("renders the badge variants", () => {
    render(<Badge variant="basketball">Hot</Badge>);

    expect(screen.getByText("Hot")).toHaveClass("bg-basketball");
  });
});
