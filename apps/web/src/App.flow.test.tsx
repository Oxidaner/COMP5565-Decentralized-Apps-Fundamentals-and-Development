import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { formatDate } from "./format";

const mocks = vi.hoisted(() => ({ getReadContract: vi.fn(), getWalletContract: vi.fn() }));
vi.mock("./contract", () => ({ ...mocks, contractAddress: "0x1111111111111111111111111111111111111111" }));

const manufacturer = "0x2222222222222222222222222222222222222222";
const owner = "0x3333333333333333333333333333333333333333";
const recipient = "0x4444444444444444444444444444444444444444";
const center = "0x5555555555555555555555555555555555555555";
const now = 1_800_000_000;
const initialProduct = {
  productId: "P-001", serialNumber: "S-001", model: "Test Phone", manufacturer,
  currentOwner: owner, registeredAt: BigInt(now - 100), warrantyDuration: 86400n,
  maxClaims: 3n, approvedClaims: 0n, warrantyStart: BigInt(now - 10), warrantyEnd: BigInt(now + 86390),
  stage: 2n, exists: true
};
const initialClaim = {
  id: 1n, applicantOwner: owner, problemType: 1n, submittedAt: BigInt(now), status: 1n,
  processedBy: center, processedAt: 0n, servicedBy: center, servicedAt: 0n, serviceResult: 0n
};
let product = { ...initialProduct };
let claims: (typeof initialClaim)[] = [];
let transfer = { exists: false, to: recipient, from: owner, deadline: BigInt(now + 600), nextStage: 2n };
let read: ReturnType<typeof makeReadContract>;
let write: ReturnType<typeof makeWriteContract>;

function makeReadContract() {
  return {
    getProduct: vi.fn(async () => product),
    getProductKey: vi.fn(async () => "product-key"),
    getPendingTransfer: vi.fn(async () => transfer),
    getClaimIds: vi.fn(async () => claims.map((claim) => claim.id)),
    getClaim: vi.fn(async (_id: string, _serial: string, id: bigint) => claims.find((claim) => claim.id === id)),
    filters: { OwnershipTransferred: vi.fn(() => "ownership-filter") },
    queryFilter: vi.fn(async () => [{ args: { from: manufacturer, to: owner, transferredAt: now - 10 } }])
  };
}

function transaction(update: () => void) {
  return { wait: vi.fn(async () => { update(); }) };
}

function makeWriteContract() {
  return {
    registerProduct: vi.fn(async (id: string, serial: string, model: string) => transaction(() => {
      product = { ...product, productId: id, serialNumber: serial, model };
    })),
    initiateTransfer: vi.fn(async () => transaction(() => { transfer = { ...transfer, exists: true }; })),
    acceptTransfer: vi.fn(async () => transaction(() => {
      product = { ...product, currentOwner: recipient };
      transfer = { ...transfer, exists: false };
    })),
    submitClaim: vi.fn(async () => transaction(() => { claims = [{ ...initialClaim }]; })),
    approveClaim: vi.fn(async () => transaction(() => {
      claims = [{ ...claims[0], status: 3n, processedAt: BigInt(now) }];
      product = { ...product, approvedClaims: product.approvedClaims + 1n };
    })),
    rejectClaim: vi.fn(async () => transaction(() => {
      claims = [{ ...claims[0], status: 2n, processedAt: BigInt(now) }];
    })),
    completeServicing: vi.fn(async () => transaction(() => {
      claims = [{ ...claims[0], status: 4n, servicedAt: BigInt(now), serviceResult: 1n }];
    }))
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(now * 1000);
  product = { ...initialProduct };
  claims = [];
  transfer = { exists: false, to: recipient, from: owner, deadline: BigInt(now + 600), nextStage: 2n };
  read = makeReadContract();
  write = makeWriteContract();
  mocks.getReadContract.mockReturnValue(read);
  mocks.getWalletContract.mockResolvedValue({ contract: write, address: owner });
});

afterEach(() => {
  cleanup();
  delete window.ethereum;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function verifyProduct() {
  fireEvent.change(screen.getByLabelText("Product ID", { exact: true }), { target: { value: " P-001 " } });
  fireEvent.change(screen.getByLabelText("Serial number", { exact: true }), { target: { value: " S-001 " } });
  fireEvent.click(screen.getByRole("button", { name: "Verify product" }));
  await screen.findByRole("heading", { name: "Test Phone" });
}

describe("front-end acceptance", () => {
  it("AC04: reads product details and ownership history without connecting a wallet", async () => {
    render(<App />);
    await verifyProduct();
    expect(read.getProduct).toHaveBeenCalledWith("P-001", "S-001");
    expect(read.queryFilter).toHaveBeenCalledWith("ownership-filter");
    expect(screen.getByText("Ownership transferred")).toBeInTheDocument();
    expect(mocks.getWalletContract).not.toHaveBeenCalled();
  });

  it("AC05/AC09: shows the dates, duration and exhausted claim limit", async () => {
    product.approvedClaims = product.maxClaims;
    render(<App />);
    await verifyProduct();
    expect(screen.getByText("Claim limit reached")).toBeInTheDocument();
    expect(screen.getByText(formatDate(product.warrantyStart))).toBeInTheDocument();
    expect(screen.getByText(formatDate(product.warrantyEnd))).toBeInTheDocument();
    expect(screen.getByText("1 day")).toBeInTheDocument();
  });

  it("AC05/AC09: updates the status when time passes without another query", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    render(<App />);
    await verifyProduct();
    expect(screen.getByText("Active")).toBeInTheDocument();
    vi.mocked(Date.now).mockReturnValue(Number(product.warrantyEnd + 1n) * 1000);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("AC02/AC11: refreshes the newly registered product rather than the previous query", async () => {
    render(<App />);
    await verifyProduct();
    fireEvent.change(screen.getByPlaceholderText("Product ID"), { target: { value: "NEW-002" } });
    fireEvent.change(screen.getByPlaceholderText("Serial number"), { target: { value: "NEW-SERIAL" } });
    fireEvent.change(screen.getByPlaceholderText("Model"), { target: { value: "New Phone" } });
    fireEvent.click(screen.getByRole("button", { name: "Register product" }));
    await screen.findByRole("heading", { name: "New Phone" });
    expect(write.registerProduct).toHaveBeenCalledWith("NEW-002", "NEW-SERIAL", "New Phone", 62208000, 3);
    expect(read.getProduct).toHaveBeenLastCalledWith("NEW-002", "NEW-SERIAL");
    expect(screen.getByRole("status")).toHaveTextContent("Transaction confirmed");
  });

  it("AC03/AC11: starts a transfer and refreshes the owner after acceptance", async () => {
    render(<App />);
    await verifyProduct();
    fireEvent.change(screen.getByPlaceholderText("Recipient wallet address"), { target: { value: recipient } });
    fireEvent.click(screen.getByRole("button", { name: "Start transfer" }));
    const accept = await screen.findByRole("button", { name: "Accept" });
    expect(write.initiateTransfer).toHaveBeenCalledWith("P-001", "S-001", recipient);
    fireEvent.click(accept);
    await waitFor(() => expect(write.acceptTransfer).toHaveBeenCalledWith("P-001", "S-001"));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument());
    expect(product.currentOwner).toBe(recipient);
  });

  it("AC11: applies writes to the displayed product even when the query fields are edited", async () => {
    render(<App />);
    await verifyProduct();
    fireEvent.change(screen.getByLabelText("Product ID", { exact: true }), { target: { value: "NOT-LOADED" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit claim" }));
    await screen.findByText("Pending");
    expect(write.submitClaim).toHaveBeenCalledWith("P-001", "S-001", 0);
    expect(screen.getByLabelText("Product ID", { exact: true })).toHaveValue("P-001");
  });

  it("AC06-AC08: submits, approves and completes a claim, displaying the refreshed history", async () => {
    render(<App />);
    await verifyProduct();
    fireEvent.click(screen.getByRole("button", { name: "Submit claim" }));
    await screen.findByText("Pending");
    expect(write.submitClaim).toHaveBeenCalledWith("P-001", "S-001", 0);
    fireEvent.change(screen.getByPlaceholderText("Claim ID"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await screen.findByText("Approved");
    expect(write.approveClaim).toHaveBeenCalledWith("P-001", "S-001", 1n);
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    await screen.findByText("Serviced");
    expect(write.completeServicing).toHaveBeenCalledWith("P-001", "S-001", 1n, 1);
    expect(within(screen.getByText("Serviced").closest(".claim-row")!).getByText("Repaired")).toBeInTheDocument();
  });

  it("AC07: refreshes a rejected claim without consuming quota", async () => {
    claims = [{ ...initialClaim }];
    render(<App />);
    await verifyProduct();
    fireEvent.change(screen.getByPlaceholderText("Claim ID"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await screen.findByText("Rejected");
    expect(write.rejectClaim).toHaveBeenCalledWith("P-001", "S-001", 1n);
    expect(screen.getByText("0 / 3")).toBeInTheDocument();
  });

  it("AC11: does not round large claim IDs through a JavaScript number", async () => {
    claims = [{ ...initialClaim, id: 9007199254740993n }];
    render(<App />);
    await verifyProduct();
    fireEvent.change(screen.getByPlaceholderText("Claim ID"), { target: { value: "9007199254740993" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(write.approveClaim).toHaveBeenCalledWith("P-001", "S-001", 9007199254740993n));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Transaction confirmed"));
  });

  it("AC11: rejects a non-integer claim ID before opening the wallet", async () => {
    render(<App />);
    await verifyProduct();
    fireEvent.change(screen.getByPlaceholderText("Claim ID"), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(screen.getByRole("status")).toHaveTextContent("positive whole-number claim ID");
    expect(mocks.getWalletContract).not.toHaveBeenCalled();
  });

  it("AC11: shows a wallet rejection without sending a transaction", async () => {
    mocks.getWalletContract.mockRejectedValue(new Error("User rejected the request"));
    render(<App />);
    await verifyProduct();
    fireEvent.click(screen.getByRole("button", { name: "Submit claim" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("User rejected the request"));
    expect(write.submitClaim).not.toHaveBeenCalled();
  });

  it("AC11: preserves confirmation when only the post-transaction refresh fails", async () => {
    render(<App />);
    await verifyProduct();
    read.getProduct.mockRejectedValueOnce(new Error("RPC offline"));
    fireEvent.click(screen.getByRole("button", { name: "Submit claim" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Transaction confirmed, but refresh failed"));
  });

  it("AC11: blocks duplicate writes while waiting for confirmation", async () => {
    let finish!: () => void;
    const confirmed = new Promise<void>((resolve) => { finish = resolve; });
    write.submitClaim.mockResolvedValueOnce({ wait: vi.fn(() => confirmed) });
    render(<App />);
    await verifyProduct();
    const submit = screen.getByRole("button", { name: "Submit claim" });
    fireEvent.click(submit);
    await waitFor(() => expect(write.submitClaim).toHaveBeenCalledTimes(1));
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(write.submitClaim).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
  });

  it.each(["accountsChanged", "chainChanged"])("AC11: invalidates the wallet on %s and removes event listeners", async (event) => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const removeListener = vi.fn();
    window.ethereum = { request: vi.fn(), on: (name, listener) => { listeners.set(name, listener); }, removeListener };
    const { unmount } = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    await screen.findByRole("button", { name: /0x3333/ });
    act(() => listeners.get(event)?.(event === "accountsChanged" ? [recipient] : "0x1"));
    expect(screen.getByRole("button", { name: "Connect wallet" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/reconnect/i);
    unmount();
    expect(removeListener).toHaveBeenCalledWith(event, listeners.get(event));
  });
});
