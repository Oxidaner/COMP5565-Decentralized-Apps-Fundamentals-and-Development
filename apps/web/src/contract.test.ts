import { afterEach, describe, expect, it, vi } from "vitest";

const address = "0x1111111111111111111111111111111111111111";

afterEach(() => {
  delete window.ethereum;
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function setup(chainId: string) {
  vi.stubEnv("VITE_CONTRACT_ADDRESS", address);
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

  it("gives installation instructions when no browser wallet is available", async () => {
    const { getWalletContract } = await setup("0x7a69");
    delete window.ethereum;
    await expect(getWalletContract()).rejects.toThrow(/install or enable a browser wallet/i);
  });
});
