import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Room from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ roomId: "ROOM1" }),
  useSearchParams: () => ({
    get: (key: string) => {
      if (key === "playerName") return "Tim";
      return null;
    },
  }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("../../lib/socket", () => ({
  SocketProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSocket: () => ({ socket: null, isConnected: false }),
  joinRoom: vi.fn(),
  submitMove: vi.fn(),
  leaveRoom: vi.fn(),
}));

vi.mock("../../../components/ClientOnly", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("Room page", () => {
  it("shows connecting state before socket is available", () => {
    render(<Room />);
    expect(screen.getByText(/connecting/i)).toBeInTheDocument();
    expect(screen.getByText(/preparing your session/i)).toBeInTheDocument();
  });
});
