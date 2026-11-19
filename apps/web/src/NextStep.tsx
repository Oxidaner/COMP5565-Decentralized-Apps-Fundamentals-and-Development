import { shortAddress } from "./format";

export type GuideTarget = "setup" | "verify" | "register" | "transfer" | "claim" | "service";
export type GuideStep = {
  target: GuideTarget;
  title: string;
  detail: string;
  action: string;
  focus: string;
  account?: string;
  wallet?: string;
  claimId?: string;
};

type GuideProduct = { currentOwner: string; stage: bigint };
type GuideClaim = { id: bigint; status: bigint };
type GuideTransfer = { to: string; deadline: bigint };

export function getNextStep({ connected, product, transfer, claims, warranty, now }: {
  connected: boolean; product: GuideProduct | null; transfer: GuideTransfer | null;
  claims: GuideClaim[]; warranty: string; now: number;
}): GuideStep {
  if (!connected) return {
    target: "setup", title: "Connect the shared team contract first",
    detail: "In Network setup, enter the Contract address and Deployment block from the deployment, then click Connect contract. This is not a wallet address; if the team already has a contract, there is no need to redeploy.",
    action: "Go to contract setup", focus: "contract-address"
  };
  if (!product) return {
    target: "verify", title: "Find the product you want to work with",
    detail: "Enter the Product ID and Serial number, then click Verify product. Looking up a product needs no wallet; if it is not registered yet, start with Register product.",
    action: "Go to product lookup", focus: "product-id"
  };
  if (transfer) {
    if (now > Number(transfer.deadline)) return {
      target: "transfer", title: "This transfer has expired. Clear it, then start again",
      detail: "In Transfer ownership, click Expire and confirm in your wallet. Clearing does not change the owner; afterwards the current owner can Start transfer again.",
      action: "Go to expired transfer", focus: "expire-transfer", wallet: "Any account can clear it"
    };
    return {
      target: "transfer", title: "Hand over to the recipient for step two",
      detail: "Switch to the recipient account below and connect it to this site, then click Accept in Transfer ownership and confirm in your wallet. Start transfer alone does not change the owner. The original owner can also click Cancel.",
      action: "Go to accept transfer", focus: "accept-transfer", account: transfer.to, wallet: "Designated recipient"
    };
  }
  const approved = claims.find((claim) => claim.status === 3n);
  if (approved) return {
    target: "service", title: `Claim #${approved.id} is approved. Record the service result next`,
    detail: "Approval is not the repair. After the actual service, choose a Service result in Process a claim, click Complete and confirm. This approved claim can still be completed even if the warranty has expired or its claims are used up.",
    action: `Go to complete claim #${approved.id}`, focus: "service-result", claimId: approved.id.toString(),
    wallet: "An authorized service center, or the one that approved this claim"
  };
  const pending = claims.find((claim) => claim.status === 1n);
  if (pending) return {
    target: "service", title: `Claim #${pending.id} is waiting for a service center`,
    detail: warranty === "Active"
      ? "Switch to an authorized service center. In Process a claim, check the Claim ID, click Approve or Reject and confirm in your wallet. Only approval uses up a claim; after a rejection the owner can apply again."
      : "This claim is still pending, but the warranty has expired or its claims are used up, so it can no longer be approved. An authorized service center can check the Claim ID in Process a claim and click Reject.",
    action: `Go to process claim #${pending.id}`, focus: "claim-id", claimId: pending.id.toString(), wallet: "Authorized service center"
  };
  if (product.stage < 2n) return {
    target: "transfer", title: product.stage === 0n ? "Manufacturer starts the first transfer" : "Retailer sells to a customer",
    detail: product.stage === 0n
      ? "Using the current owner account, enter an authorized retailer's full wallet address in Transfer ownership, click Start transfer and confirm. The retailer then switches to their own account and clicks Accept."
      : "Using the current owner account, enter the wallet address of a customer with no organization role, click Start transfer and confirm. The warranty starts once the customer clicks Accept with their own account.",
    action: "Go to recipient address", focus: "transfer-recipient", account: product.currentOwner, wallet: "Current owner"
  };
  if (warranty !== "Active") return {
    target: "transfer", title: warranty === "Expired" ? "Warranty expired; ownership can still be transferred" : "Claim limit reached; records stay visible and the product can be resold",
    detail: "New claims are not available. History is kept; to resell, the current owner enters the new customer's address and clicks Start transfer, then the recipient clicks Accept.",
    action: "View resale steps", focus: "transfer-recipient", account: product.currentOwner, wallet: "Current owner, for resale"
  };
  const serviced = claims.some((claim) => claim.status === 4n);
  return {
    target: "claim", title: serviced ? "This service is complete and stays on the product record" : "The product belongs to a customer; the warranty is ready to use",
    detail: serviced
      ? "No need to click Complete again. Only if a new problem appears does the current owner choose a Problem type and click Submit claim; to resell, use Transfer ownership."
      : "For warranty service, the current owner chooses a Problem type in Submit a claim, clicks Submit claim and confirms. No fault, no claim needed; the product can also be resold in Transfer ownership.",
    action: "View warranty actions", focus: "problem-type", account: product.currentOwner, wallet: "Current owner, for claims or resale"
  };
}

export default function NextStep({ step, walletAddress, busy, phase, onNavigate }: {
  step: GuideStep; walletAddress: string; busy: boolean;
  phase: "signature" | "confirmation" | null; onNavigate: (step: GuideStep) => void;
}) {
  const walletMatches = !!step.account && step.account.toLowerCase() === walletAddress.toLowerCase();
  return (
    <aside className="next-step" aria-label="Next step guide" aria-busy={busy}>
      <div className="next-step-copy" aria-live="polite" aria-atomic="true">
        <span className="guide-kicker">{busy ? "In progress" : "Next step"}</span>
        <h3>{busy ? phase === "signature" ? "Confirm this transaction in your wallet" : phase === "confirmation" ? "Transaction submitted; waiting for confirmation" : "Reading on-chain records" : step.title}</h3>
        <p>{busy ? phase ? "Check the wallet account and network before confirming. No need to click again while it is processing; the next step appears here when it is done." : "The next step for this product appears once reading finishes." : step.detail}</p>
        {!busy && step.wallet && <div className="guide-account">
          <span>{step.wallet}{step.account && walletMatches ? " · matches the account connected to this page" : ""}</span>
          {step.account && <code>{step.account}</code>}
          {!step.account || !walletMatches ? <small>{walletAddress ? `This page is connected to ${shortAddress(walletAddress)}. ` : "No wallet is connected to this page yet. "}In MetaMask, select the account for this step and make sure it is connected to this site, then click Connect wallet at the top right and check that both addresses match. Switching accounts does not require changing the contract address.</small> : null}
        </div>}
      </div>
      {!busy && <div className="guide-actions">
        <button className="guide-button" type="button" onClick={() => onNavigate(step)}>{step.action}<span aria-hidden="true"> ↗</span></button>
        {step.target === "verify" && <button className="guide-link" type="button" onClick={() => onNavigate({ target: "register", title: "", detail: "", action: "", focus: "registration-product-id" })}>No product yet? Register one</button>}
      </div>}
    </aside>
  );
}
