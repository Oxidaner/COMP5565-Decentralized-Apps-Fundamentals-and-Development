import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.stubEnv("VITE_CONTRACT_ADDRESS", "");
  vi.stubEnv("VITE_NETWORK", "local");
});
afterEach(() => { vi.unstubAllEnvs(); });

const address = "0x1111111111111111111111111111111111111111";

describe("deployment connection", () => {
  it("keeps the original local chain as the development default", async () => {
    const { loadConnection, targetNetwork } = await import("./network");
    expect(targetNetwork.chainId).toBe(31337);
    expect(loadConnection().address).toBe("");
  });

  it("uses the same shared connection in a fresh browser without relying on local storage", async () => {
    const { saveConnection, loadConnection, connectionLink } = await import("./network");
    const connection = { address, fromBlock: 123 };
    saveConnection(connection);
    const link = connectionLink(connection);
    window.localStorage.clear();
    window.history.replaceState(null, "", link);
    expect(loadConnection()).toEqual(connection);
  });

  it("does not load a link for the wrong chain or accept a remote RPC from a link", async () => {
    window.history.replaceState(null, "", `/#chain=11155111&contract=${address}&from=123&rpc=https://example.com`);
    const { loadConnection, targetNetwork } = await import("./network");
    expect(loadConnection().address).toBe("");
    expect(targetNetwork.rpcUrl).toBe("http://127.0.0.1:8545");
  });

  it("requires an actual Sepolia deployment block", async () => {
    vi.stubEnv("VITE_NETWORK", "sepolia");
    const { validateConnection, targetNetwork } = await import("./network");
    expect(targetNetwork.chainId).toBe(11155111);
    expect(() => validateConnection(address, "0")).toThrow(/actual deployment block/);
    expect(validateConnection(address, "123")).toEqual({ address, fromBlock: 123 });
  });

  it.each(["-1", "1.2", "NaN", "9007199254740993"])("rejects invalid block %s", async (block) => {
    const { validateConnection } = await import("./network");
    expect(() => validateConnection(address, block)).toThrow(/whole number/);
  });

  it("rejects mainnet as a deployment target", async () => {
    vi.stubEnv("VITE_NETWORK", "mainnet");
    await expect(import("./network")).rejects.toThrow(/local or sepolia/);
  });
});
