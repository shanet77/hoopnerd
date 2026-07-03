import React from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

function TestTabs() {
  return (
    <Tabs defaultValue="a">
      <TabsList>
        <TabsTrigger value="a">Tab A</TabsTrigger>
        <TabsTrigger value="b">Tab B</TabsTrigger>
        <TabsTrigger value="c">Tab C</TabsTrigger>
      </TabsList>
      <TabsContent value="a">Panel A</TabsContent>
      <TabsContent value="b">Panel B</TabsContent>
      <TabsContent value="c">Panel C</TabsContent>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("renders triggers and shows only the active panel content", () => {
    render(<TestTabs />);

    expect(screen.getByRole("tab", { name: "Tab A" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tab B" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tab C" })).toBeInTheDocument();

    // Only default panel visible
    expect(screen.getByText("Panel A")).toBeVisible();
    expect(screen.getByText("Panel B")).not.toBeVisible();
    expect(screen.getByText("Panel C")).not.toBeVisible();
  });

  it("clicking an inactive trigger switches visible panel and aria-selected", () => {
    render(<TestTabs />);

    const triggerB = screen.getByRole("tab", { name: "Tab B" });
    expect(triggerB).toHaveAttribute("aria-selected", "false");

    fireEvent.click(triggerB);

    expect(triggerB).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Panel B")).toBeVisible();
    expect(screen.getByText("Panel A")).not.toBeVisible();
  });

  it("sets correct ARIA roles", () => {
    render(<TestTabs />);

    expect(screen.getByRole("tablist")).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    // Only one tabpanel visible at a time means getAllByRole might find one
    const panels = screen.getAllByRole("tabpanel", { hidden: true });
    // hidden panels should still be in the DOM
    expect(panels).toHaveLength(3);
  });

  it("links triggers to panels via aria-controls / aria-labelledby", () => {
    render(<TestTabs />);

    const triggerA = screen.getByRole("tab", { name: "Tab A" });
    const panelA = screen.getByRole("tabpanel", { name: "Tab A" });

    expect(triggerA.getAttribute("aria-controls")).toBe(panelA.id);
    expect(panelA.getAttribute("aria-labelledby")).toBe(triggerA.id);
  });

  it("arrow keys move focus and activation", () => {
    render(<TestTabs />);

    const triggerA = screen.getByRole("tab", { name: "Tab A" });
    const triggerB = screen.getByRole("tab", { name: "Tab B" });
    const triggerC = screen.getByRole("tab", { name: "Tab C" });

    triggerA.focus();
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });

    expect(triggerB).toHaveFocus();
    expect(triggerB).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Panel B")).toBeVisible();

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(triggerC).toHaveFocus();
    expect(triggerC).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    // wraps around
    expect(triggerA).toHaveFocus();
    expect(triggerA).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowLeft" });
    expect(triggerC).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "Home" });
    expect(triggerA).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "End" });
    expect(triggerC).toHaveFocus();
  });

  it("honours defaultValue", () => {
    render(
      <Tabs defaultValue="b">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
        <TabsContent value="b">Content B</TabsContent>
      </Tabs>,
    );

    expect(screen.getByRole("tab", { name: "B" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Content B")).toBeVisible();
    expect(screen.getByText("Content A")).not.toBeVisible();
  });

  it("supports controlled value + onValueChange", () => {
    let lastValue = "";
    const { rerender } = render(
      <Tabs value="x" defaultValue="unused" onValueChange={(v) => (lastValue = v)}>
        <TabsList>
          <TabsTrigger value="x">X</TabsTrigger>
          <TabsTrigger value="y">Y</TabsTrigger>
        </TabsList>
        <TabsContent value="x">X Panel</TabsContent>
        <TabsContent value="y">Y Panel</TabsContent>
      </Tabs>,
    );

    expect(screen.getByRole("tab", { name: "X" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("X Panel")).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Y" }));
    expect(lastValue).toBe("y");
    // still on X because controlled
    expect(screen.getByText("X Panel")).toBeVisible();

    rerender(
      <Tabs value="y" defaultValue="unused" onValueChange={(v) => (lastValue = v)}>
        <TabsList>
          <TabsTrigger value="x">X</TabsTrigger>
          <TabsTrigger value="y">Y</TabsTrigger>
        </TabsList>
        <TabsContent value="x">X Panel</TabsContent>
        <TabsContent value="y">Y Panel</TabsContent>
      </Tabs>,
    );

    expect(screen.getByText("Y Panel")).toBeVisible();
  });

  it("sets tabIndex correctly (0 for active, -1 for inactive)", () => {
    render(<TestTabs />);

    expect(screen.getByRole("tab", { name: "Tab A" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Tab B" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tab", { name: "Tab C" })).toHaveAttribute("tabindex", "-1");
  });
});
