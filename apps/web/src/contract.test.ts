import { afterEach, describe, expect, it, vi } from "vitest";

const address = "0x1111111111111111111111111111111111111111";

afterEach(() => {
  delete window.ethereum;
  vi.unstubAllEnvs();
  vi.resetModules();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

async function setup(chainId: string) {
  vi.stubEnv("VITE_CONTRACT_ADDRESS", address);
  if (!import.meta.env.VITE_NETWORK) vi.stubEnv("VITE_NETWORK", "local");
  const request = vi.fn(async ({ method }: { method: string }) => {
    if (method === "eth_chainId") return chainId;
    if (method === "eth_accounts" || method === "eth_requestAccounts") return [address];
    throw new Error(`Unexpected method: ${method}`);
  });
  window.ethereum = { request };
  const { getWalletContract } = await import("./contract");
  return { getWalletContract, request };
}

describe("AC11: wallet network validation through ethers BrowserProvider", () => {
  it("blocks the wrong network before requesting accounts or a signer", async () => {
    const { getWalletContract, request } = await setup("0x1");
    await expect(getWalletContract()).rejects.toThrow(/31337/);
    expect(request.mock.calls.map(([args]) => args.method)).not.toContain("eth_requestAccounts");
  });

  it("connects a signer on the local Hardhat chain", async () => {
    const { getWalletContract } = await setup("0x7a69");
    const wallet = await getWalletContract();
    expect(wallet.address).toBe(address);
    expect(wallet.contract.target).toBe(address);
  });

  it("accepts Sepolia when configured", async () => {
    vi.stubEnv("VITE_NETWORK", "sepolia");
    vi.stubEnv("VITE_DEPLOYMENT_BLOCK", "123");
    const { getWalletContract } = await setup("0xaa36a7");
    expect((await getWalletContract()).address).toBe(address);
  });

  it("rejects a local wallet on a Sepolia build", async () => {
    vi.stubEnv("VITE_NETWORK", "sepolia");
    vi.stubEnv("VITE_DEPLOYMENT_BLOCK", "123");
    const { getWalletContract } = await setup("0x7a69");
    await expect(getWalletContract()).rejects.toThrow(/11155111/);
  });

  it("bounds ownership history queries to 5000-block windows starting at deployment", async () => {
    const { getOwnershipEvents } = await import("./contract");
    const { EventLog } = await import("ethers");
    const event = Object.create(EventLog.prototype);
    const queryFilter = vi.fn(async () => [event]);
    const contract = {
      runner: { provider: { getBlockNumber: async () => 15100 } },
      filters: { OwnershipTransferred: () => "filter" },
      queryFilter
    };
    const events = await getOwnershipEvents(contract as unknown as import("ethers").Contract, "key", 10000);
    expect(queryFilter.mock.calls).toEqual([["filter", 10000, 14999], ["filter", 15000, 15100]]);
    expect(events).toHaveLength(2);
  });

  it("gives installation instructions when no browser wallet is available", async () => {
    const { getWalletContract } = await setup("0x7a69");
    delete window.ethereum;
    await expect(getWalletContract()).rejects.toThrow(/install or enable a browser wallet/i);
  });
});
