import "@testing-library/jest-dom";
import React from "react";
import { describe, expect, it } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card, CardContent, CardDescription, CardTitle } from "./card";
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

  it("renders card and badge sections", () => {
    render(
      <Card>
        <CardTitle>Title</CardTitle>
        <CardDescription>Description</CardDescription>
        <CardContent>
          <Badge variant="basketball">Hot</Badge>
        </CardContent>
      </Card>
    );

    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Hot")).toHaveClass("bg-basketball");
  });
});
