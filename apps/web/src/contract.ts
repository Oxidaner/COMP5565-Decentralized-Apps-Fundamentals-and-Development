import { BrowserProvider, Contract, JsonRpcProvider } from "ethers";

export const CONTRACT_ABI = [
  "function admin() view returns (address)",
  "function transferTimeout() view returns (uint64)",
  "function isManufacturer(address) view returns (bool)",
  "function isRetailer(address) view returns (bool)",
  "function isServiceCenter(address) view returns (bool)",
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

export const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS ?? "";

export function getReadContract(): Contract | null {
  const rpcUrl = import.meta.env.VITE_RPC_URL ?? "http://127.0.0.1:8545";
  if (!contractAddress) {
    return null;
  }
  return new Contract(contractAddress, CONTRACT_ABI, new JsonRpcProvider(rpcUrl));
}

export async function getWalletContract(): Promise<{
  contract: Contract;
  address: string;
}> {
  if (!contractAddress) {
    throw new Error("Set VITE_CONTRACT_ADDRESS after deploying the local contract.");
  }
  if (!window.ethereum) {
    throw new Error("Please install or enable a browser wallet.");
  }
  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  return { contract: new Contract(contractAddress, CONTRACT_ABI, signer), address: await signer.getAddress() };
}
