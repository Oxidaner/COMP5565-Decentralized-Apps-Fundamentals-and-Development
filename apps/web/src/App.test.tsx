import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";

afterEach(cleanup);

describe("public verification flow", () => {
  it("shows product verification without requiring a wallet", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /Find a product/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Verify product/i })).toBeInTheDocument();
    expect(screen.getByText(/Public verification does not require a wallet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Connect wallet/i })).toBeInTheDocument();
  });

  it("renders the four role workbench paths", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /Register product/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Transfer ownership/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Submit a claim/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Process a claim/i })).toBeInTheDocument();
  });
});
