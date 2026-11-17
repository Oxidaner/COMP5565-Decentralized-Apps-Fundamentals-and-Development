import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NextStep, { getNextStep } from "./NextStep";

afterEach(cleanup);

const owner = "0x3333333333333333333333333333333333333333";
const recipient = "0x4444444444444444444444444444444444444444";
const product = { currentOwner: owner, stage: 2n };
const now = 1_800_000_000;
const activeWarranty = "Active";
const claim = (id: bigint, status: bigint) => ({ id, status });
const step = (overrides: Partial<Parameters<typeof getNextStep>[0]> = {}) => getNextStep({
  connected: true, product, transfer: null, claims: [], warranty: activeWarranty, now, ...overrides
});

describe("contextual next-step guide", () => {
  it("guides initial setup and public lookup before role actions", () => {
    expect(step({ connected: false }).focus).toBe("contract-address");
    expect(step({ product: null }).focus).toBe("product-id");
  });

  it("asks the specified recipient to accept before moving on", () => {
    const next = step({ transfer: { to: recipient, deadline: BigInt(now + 60) } });
    expect(next.focus).toBe("accept-transfer");
    expect(next.account).toBe(recipient);
    expect(next.detail).toContain("Accept");
  });

  it("offers timeout cleanup after the transfer deadline", () => {
    expect(step({ transfer: { to: recipient, deadline: BigInt(now - 1) } }).focus).toBe("expire-transfer");
  });

  it("prioritizes completing approved work over submitting a new claim", () => {
    const next = step({ claims: [claim(7n, 3n)], warranty: "Expired" });
    expect(next.focus).toBe("service-result");
    expect(next.claimId).toBe("7");
    expect(next.detail).toContain("仍可完成");
  });

  it("routes expired pending claims to rejection, not approval", () => {
    const next = step({ claims: [claim(8n, 1n)], warranty: "Claim limit reached" });
    expect(next.focus).toBe("claim-id");
    expect(next.detail).toContain("不能再批准");
    expect(next.detail).toContain("Reject");
  });

  it("does not suggest new claims after expiry or exhaustion", () => {
    expect(step({ warranty: "Expired" }).target).toBe("transfer");
    expect(step({ warranty: "Claim limit reached" }).target).toBe("transfer");
  });

  it("explains wallet mismatch and navigates without submitting a transaction", () => {
    const onNavigate = vi.fn();
    const next = step();
    render(<NextStep step={next} walletAddress={recipient} busy={false} phase={null} onNavigate={onNavigate} />);
    expect(screen.getByText(/Connect wallet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /查看保修操作/ }));
    expect(onNavigate).toHaveBeenCalledWith(next);
  });

  it("explains how to connect the role wallet when its address is not known", () => {
    const next = step({ claims: [claim(4n, 1n)] });
    render(<NextStep step={next} walletAddress="" busy={false} phase={null} onNavigate={vi.fn()} />);
    expect(screen.getByText("已授权服务中心", { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/MetaMask 中选好本步账户/)).toBeInTheDocument();
  });
});
