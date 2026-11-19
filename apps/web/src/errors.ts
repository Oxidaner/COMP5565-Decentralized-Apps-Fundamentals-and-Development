import { Interface } from "ethers";
import { targetNetwork } from "./network";
import type { Feedback } from "./ActionFeedback";

const contractErrors: Record<string, string> = {
  NotAdmin: "Only the administrator can grant or revoke roles. Switch to the account that deployed the contract, connect it to this site in your wallet, then click Connect wallet again.",
  NotManufacturer: "This account is not an authorized manufacturer, so it cannot register products. Switch to a manufacturer account or ask the administrator to grant the role.",
  NotServiceCenter: "This account cannot process this claim. Connect an authorized service center; a revoked center can only complete repairs it approved earlier.",
  Unauthorized: "This account is not allowed to perform this action. Check the role this step needs and reconnect your wallet.",
  EmptyValue: "Required fields cannot be empty. Enter the product ID, serial number and model.",
  InvalidAddress: "Invalid wallet address: enter a complete, non-zero address. The recipient cannot be the current owner.",
  InvalidWarranty: "Warranty length and claim limit must be greater than zero. Check the registration details.",
  AlreadyRegistered: "This product ID or serial number is already registered. Use an unused pair, or click Verify product to view the existing product.",
  ProductNotFound: "No product matches this product ID and serial number. Check the input and contract address, or ask the manufacturer to register the product first.",
  NotCurrentOwner: "Only the current owner can do this. Use the Current owner account shown in the product details, connect it to this site, then click Connect wallet again.",
  InvalidRolePath: "The recipient's role does not fit the transfer rules: a manufacturer can only transfer to an authorized retailer, and retailers and customers can only transfer to a customer with no organization role.",
  TransferAlreadyPending: "A transfer is already waiting for acceptance. Accept, reject or cancel it first; click Expire to clear one that has timed out.",
  TransferNotFound: "There is no pending transfer; another account may have handled it. Click Verify product to refresh, then try again.",
  TransferExpired: "This transfer has expired and can no longer be accepted. Click Expire to clear it, then the current owner can start a new transfer.",
  NotTransferRecipient: "Only the designated recipient can accept or reject this transfer. Switch to the Pending recipient account, connect it to this site, and try again.",
  InvalidEnumValue: "Invalid problem type or service result. Select it again.",
  InvalidTimeout: "The transfer timeout must be greater than zero.",
  ClaimAlreadyPending: "This product already has a pending claim, so another cannot be submitted. Wait for a service center to process it first.",
  ClaimNotFound: "Claim ID not found. Check the Claim history for this product and enter the correct number.",
  InvalidClaimStatus: "This claim's status does not allow this action. Only Pending claims can be approved or rejected, only Approved claims can be completed, and finished claims cannot be processed again.",
  WarrantyUnavailable: "No warranty coverage is available for a new claim: the warranty may not be active yet, may have expired, or has reached its approved-claim limit. Check the product details; an already Approved claim can still be completed.",
  ClaimOwnerChanged: "The product has a new owner, so this older claim can no longer be approved. Refresh the product; the new owner can submit a new claim under the current warranty."
};

export const CONTRACT_ERROR_ABI = Object.keys(contractErrors).map((name) => `error ${name}()`);
const errors = new Interface(CONTRACT_ERROR_ABI);

export class InputError extends Error {}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function errorMessage(error: unknown, action?: string): string {
  if (error instanceof InputError) return error.message;
  const outer = record(error);
  const candidates = [outer, record(outer.error), record(record(outer.info).error), record(record(outer.data).originalError)];
  for (const candidate of candidates) {
    let name = record(candidate.revert).name;
    const data = typeof candidate.data === "string" ? candidate.data : record(candidate.data).data;
    if (typeof name !== "string" && typeof data === "string") {
      try { name = errors.parseError(data)?.name; } catch { /* Not every RPC error contains ABI data. */ }
    }
    if (typeof name === "string" && contractErrors[name]) {
      if (name === "TransferExpired" && action === "expire") return "This transfer has not expired yet, so Expire is not available. Wait for the deadline, or let the original owner click Cancel or the recipient click Reject.";
      return contractErrors[name];
    }
  }
  const codes = candidates.map((candidate) => candidate.code);
  if (codes.includes("ACTION_REJECTED") || codes.includes(4001)) return "You cancelled the wallet request, so the action did not complete. To continue, click the button again and confirm in your wallet.";
  if (codes.includes(-32002)) return "Your wallet already has a pending request. Open the wallet to finish or cancel it, then return to this page.";
  if (codes.includes("INSUFFICIENT_FUNDS")) return `This account does not have enough ${targetNetwork.chainId === 11155111 ? "SepoliaETH" : "local test ETH"} to pay the network fee. Add test funds on the target network and try again.`;
  if (codes.some((code) => ["NETWORK_ERROR", "SERVER_ERROR", "TIMEOUT"].includes(String(code)))) return `Cannot reach ${targetNetwork.name}. Check the RPC and network; for local testing, make sure the Hardhat node is still running.`;
  if (codes.includes("CALL_EXCEPTION")) return "The contract rejected this action. Click Verify product to refresh, then check account permissions and the product and claim status before trying again.";
  const message = String(outer.shortMessage || outer.message || "");
  if (/user (rejected|denied)/i.test(message)) return "You cancelled the wallet request, so the action did not complete. To continue, click the button again and confirm in your wallet.";
  if (/fetch|failed to fetch|ECONNREFUSED/i.test(message)) return `Cannot read from ${targetNetwork.name}. Check the RPC; for local testing, make sure the Hardhat node has started.`;
  if (/Switch your wallet/i.test(message)) return `Wrong wallet network. Switch to ${targetNetwork.name} (Chain ID ${targetNetwork.chainId}), then click Connect wallet.`;
  if (/install or enable a browser wallet/i.test(message)) return "No browser wallet detected. Install or enable a wallet such as MetaMask, then click Connect wallet.";
  if (/configure a contract/i.test(message)) return "Enter the deployed contract address and block in Network setup first, then click Connect contract.";
  if (/valid non-zero contract address/i.test(message)) return "Invalid contract address. Enter the complete, non-zero Contract address from the deployment output, not a wallet address.";
  if (/deployment block.*non-negative whole number/i.test(message)) return "Deployment block must be a whole number of zero or more. Check the deployment output.";
  if (/Sepolia requires the actual deployment block/i.test(message)) return "On Sepolia, Deployment block must be the actual deployment block, not zero.";
  return message ? `Action not completed: ${message.split("\n")[0].slice(0, 220)}` : "Action not completed and no specific reason was returned. Check the network and wallet, refresh the product, and try again.";
}

export function transactionFailure(error: unknown, submitted: boolean, hash?: string, action?: string): Feedback {
  if (submitted && !(error instanceof InputError) && record(record(error).receipt).status !== 0) {
    return { kind: "warning", message: "The transaction was submitted, but its final result could not be confirmed. Check your wallet activity, then click Verify product; do not send it again. For a deployment, check the contract address in your wallet.", hash };
  }
  return { kind: "error", message: errorMessage(error, action), hash };
}
