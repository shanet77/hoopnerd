import "@testing-library/jest-dom";
import React from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import Room from "./page";

jest.mock("next/navigation", () => ({
  useParams: () => ({ roomId: "ROOM1" }),
  useSearchParams: () => ({
    get: (key: string) => {
      if (key === "playerName") return "Tim";
      return null;
    },
  }),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("../../lib/socket", () => ({
  SocketProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSocket: () => ({ socket: null, isConnected: false }),
  joinRoom: jest.fn(),
  submitMove: jest.fn(),
  leaveRoom: jest.fn(),
}));

jest.mock("../../../components/ClientOnly", () => ({
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
