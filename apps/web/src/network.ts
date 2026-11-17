import { getAddress, isAddress, ZeroAddress } from "ethers";

const networks = {
  local: { name: "Local Hardhat", chainId: 31337, rpcUrl: "http://127.0.0.1:8545" },
  sepolia: { name: "Sepolia", chainId: 11155111, rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com" }
} as const;

const selected: string = import.meta.env.VITE_NETWORK || "local";
if (selected !== "local" && selected !== "sepolia") throw new Error("VITE_NETWORK must be local or sepolia.");

export const targetNetwork = {
  ...networks[selected],
  rpcUrl: import.meta.env.VITE_RPC_URL || networks[selected].rpcUrl
};

export type Connection = { address: string; fromBlock: number };
const storageKey = `trace-warranty:${targetNetwork.chainId}`;

export function validateConnection(address: string, fromBlock: string | number): Connection {
  if (!isAddress(address.trim()) || getAddress(address.trim()) === ZeroAddress) {
    throw new Error("Enter a valid non-zero contract address.");
  }
  if (!/^\d+$/.test(String(fromBlock)) || !Number.isSafeInteger(Number(fromBlock))) {
    throw new Error("Enter the deployment block as a non-negative whole number.");
  }
  if (targetNetwork.chainId === 11155111 && Number(fromBlock) === 0) {
    throw new Error("Sepolia requires the actual deployment block, not zero.");
  }
  return { address: getAddress(address.trim()), fromBlock: Number(fromBlock) };
}

export function loadConnection(): Connection {
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (params.has("contract")) {
    try {
      if (params.get("chain") !== String(targetNetwork.chainId)) return { address: "", fromBlock: 0 };
      return validateConnection(params.get("contract") || "", params.get("from") || "");
    } catch {
      return { address: "", fromBlock: 0 };
    }
  }
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      const value = JSON.parse(saved);
      return validateConnection(value.address, value.fromBlock);
    }
  } catch {
    // Storage may be disabled or contain settings from an older deployment.
  }
  const address = import.meta.env.VITE_CONTRACT_ADDRESS || "";
  return address ? validateConnection(address, import.meta.env.VITE_DEPLOYMENT_BLOCK || "0") : { address: "", fromBlock: 0 };
}

export function connectionLink(connection: Connection): string {
  const url = new URL(window.location.href);
  url.hash = new URLSearchParams({
    chain: String(targetNetwork.chainId), contract: connection.address, from: String(connection.fromBlock)
  }).toString();
  return url.toString();
}

export function saveConnection(connection: Connection): void {
  const checked = validateConnection(connection.address, connection.fromBlock);
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(checked));
  } catch {
    // The share link also works when local storage is unavailable.
  }
  window.history.replaceState(null, "", connectionLink(checked));
}
