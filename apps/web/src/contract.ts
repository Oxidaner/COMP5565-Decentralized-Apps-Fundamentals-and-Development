import { BrowserProvider, Contract, EventLog, JsonRpcProvider } from "ethers";
import { Connection, loadConnection, targetNetwork } from "./network";

export const CONTRACT_ABI = [
  "function admin() view returns (address)",
  "function transferTimeout() view returns (uint64)",
  "function isManufacturer(address) view returns (bool)",
  "function isRetailer(address) view returns (bool)",
  "function isServiceCenter(address) view returns (bool)",
  "function addManufacturer(address account)",
  "function removeManufacturer(address account)",
  "function addRetailer(address account)",
  "function removeRetailer(address account)",
  "function addServiceCenter(address account)",
  "function removeServiceCenter(address account)",
  "function getProduct(string productId, string serialNumber) view returns (tuple(string productId,string serialNumber,string model,address manufacturer,address currentOwner,uint64 registeredAt,uint64 warrantyDuration,uint64 maxClaims,uint64 approvedClaims,uint64 warrantyStart,uint64 warrantyEnd,uint8 stage,bool exists))",
  "function getProductKey(string productId, string serialNumber) view returns (bytes32)",
  "function getPendingTransfer(string productId, string serialNumber) view returns (tuple(address from,address to,uint64 deadline,uint8 nextStage,bool exists))",
  "function getClaimIds(string productId, string serialNumber) view returns (uint256[])",
  "function getClaim(string productId, string serialNumber, uint256 claimId) view returns (tuple(uint256 id,address applicantOwner,uint8 problemType,uint64 submittedAt,uint8 status,address processedBy,uint64 processedAt,address servicedBy,uint64 servicedAt,uint8 serviceResult))",
  "function registerProduct(string productId,string serialNumber,string model,uint64 warrantyDuration,uint64 maxClaims)",
  "function initiateTransfer(string productId,string serialNumber,address recipient)",
  "function cancelTransfer(string productId,string serialNumber)",
  "function rejectTransfer(string productId,string serialNumber)",
  "function expireTransfer(string productId,string serialNumber)",
  "function acceptTransfer(string productId,string serialNumber)",
  "function submitClaim(string productId,string serialNumber,uint8 problemType)",
  "function rejectClaim(string productId,string serialNumber,uint256 claimId)",
  "function approveClaim(string productId,string serialNumber,uint256 claimId)",
  "function completeServicing(string productId,string serialNumber,uint256 claimId,uint8 result)",
  "event OwnershipTransferred(bytes32 indexed productKey,address indexed from,address indexed to,uint8 stage,uint64 transferredAt)",
  "event ClaimSubmitted(bytes32 indexed productKey,uint256 indexed claimId,address indexed applicantOwner,uint8 problemType,uint64 submittedAt)",
  "event ClaimRejected(bytes32 indexed productKey,uint256 indexed claimId,address indexed serviceCenter,uint64 rejectedAt)",
  "event ClaimApproved(bytes32 indexed productKey,uint256 indexed claimId,address indexed serviceCenter,uint64 approvedAt,uint64 approvedClaims)",
  "event ClaimCancelledByTransfer(bytes32 indexed productKey,uint256 indexed claimId,address indexed cancelledBy,uint64 cancelledAt)",
  "event ClaimServiced(bytes32 indexed productKey,uint256 indexed claimId,address indexed serviceCenter,uint8 result,uint64 servicedAt)"
] as const;

export function getReadContract(connection: Connection = loadConnection()): Contract | null {
  if (!connection.address) {
    return null;
  }
  return new Contract(connection.address, CONTRACT_ABI, new JsonRpcProvider(targetNetwork.rpcUrl, targetNetwork.chainId));
}

export async function getWalletSigner() {
  if (!window.ethereum) {
    throw new Error("Please install or enable a browser wallet.");
  }
  const provider = new BrowserProvider(window.ethereum);
  if ((await provider.getNetwork()).chainId !== BigInt(targetNetwork.chainId)) {
    throw new Error(`Switch your wallet to ${targetNetwork.name} (chain ID ${targetNetwork.chainId}), then reconnect.`);
  }
  await provider.send("eth_requestAccounts", []);
  return provider.getSigner();
}

export async function getWalletContract(connection: Connection = loadConnection()): Promise<{
  contract: Contract;
  address: string;
}> {
  if (!connection.address) throw new Error("Deploy or configure a contract in Network setup first.");
  const signer = await getWalletSigner();
  return { contract: new Contract(connection.address, CONTRACT_ABI, signer), address: await signer.getAddress() };
}

export async function getOwnershipEvents(contract: Contract, key: string, fromBlock: number) {
  const provider = contract.runner?.provider;
  if (!provider) throw new Error("The contract needs a read provider.");
  const latest = await provider.getBlockNumber();
  const events: EventLog[] = [];
  for (let start = fromBlock; start <= latest; start += 5000) {
    const logs = await contract.queryFilter(contract.filters.OwnershipTransferred(key), start, Math.min(start + 4999, latest));
    events.push(...logs.filter((log): log is EventLog => log instanceof EventLog));
  }
  return events;
}
