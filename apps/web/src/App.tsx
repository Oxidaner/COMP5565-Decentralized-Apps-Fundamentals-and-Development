import { FormEvent, useEffect, useMemo, useState } from "react";
import { Contract, getAddress, isAddress, ZeroAddress } from "ethers";
import { getOwnershipEvents, getReadContract, getWalletContract } from "./contract";
import { Connection, loadConnection, targetNetwork } from "./network";
import DeploymentPanel from "./DeploymentPanel";
import NextStep, { getNextStep, GuideStep } from "./NextStep";
import ActionFeedback, { Feedback } from "./ActionFeedback";
import { errorMessage, InputError, transactionFailure } from "./errors";
import { claimStatuses, formatDate, formatWarrantyStatus, problemTypes, serviceResults, shortAddress } from "./format";
import ChainScene from "./ChainScene";
import ToolIcon from "./ToolIcon";
import { useTilt } from "./useTilt";
import "./styles.css";

const ownershipStages = ["Manufacturer", "Retailer", "Customer"];
const faceNames = ["front", "back", "right", "left", "top", "bottom"];

function coverage(product: Product, now: number) {
  if (!product.warrantyStart) return { remaining: 1, waiting: true, label: "Starts when the first customer accepts" };
  const span = Math.max(1, Number(product.warrantyEnd - product.warrantyStart));
  const left = Number(product.warrantyEnd) - now;
  const days = Math.ceil(left / 86400);
  return {
    remaining: Math.min(1, Math.max(0, left / span)),
    waiting: false,
    label: left < 0 ? "Warranty period ended" : `${days} ${days === 1 ? "day" : "days"} left in warranty period`
  };
}

type Product = {
  productId: string;
  serialNumber: string;
  model: string;
  manufacturer: string;
  currentOwner: string;
  registeredAt: bigint;
  warrantyDuration: bigint;
  maxClaims: bigint;
  approvedClaims: bigint;
  warrantyStart: bigint;
  warrantyEnd: bigint;
  stage: bigint;
  exists: boolean;
};

type ProductLookup = Pick<Product, "productId" | "serialNumber">;

type Claim = {
  id: bigint;
  applicantOwner: string;
  problemType: bigint;
  submittedAt: bigint;
  status: bigint;
  processedBy: string;
  processedAt: bigint;
  servicedBy: string;
  servicedAt: bigint;
  serviceResult: bigint;
};

type PendingTransfer = {
  from: string;
  to: string;
  deadline: bigint;
  nextStage: bigint;
  exists: boolean;
};

type HistoryItem = {
  label: string;
  detail: string;
  date: string;
};

function asProduct(value: unknown): Product {
  return value as Product;
}

function asClaim(value: unknown): Claim {
  return value as Claim;
}

type ActionScope = "verify" | "wallet" | "register" | "transfer" | "claim" | "service" | "setup";

function App() {
  const [connection, setConnection] = useState(loadConnection);
  const [productId, setProductId] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [pendingTransfer, setPendingTransfer] = useState<PendingTransfer | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [walletAddress, setWalletAddress] = useState("");
  const [statusMessage, setStatusMessage] = useState("Enter a product ID and serial number to begin.");
  const [feedback, setFeedback] = useState<(Feedback & { scope: ActionScope }) | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transactionPhase, setTransactionPhase] = useState<"signature" | "confirmation" | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [recipient, setRecipient] = useState("");
  const [problemType, setProblemType] = useState("0");
  const [claimId, setClaimId] = useState("");
  const [serviceResult, setServiceResult] = useState("1");
  const [registration, setRegistration] = useState({
    productId: "",
    serialNumber: "",
    model: "",
    warrantyMonths: "24",
    maxClaims: "3"
  });

  const readContract = useMemo(() => getReadContract(connection), [connection]);
  const activeClaim = claims.find((claim) => Number(claim.status) === 1);
  const warrantyStatus = product ? formatWarrantyStatus(product, now) : "";
  const nextStep = getNextStep({ connected: !!connection.address, product, transfer: pendingTransfer, claims, warranty: warrantyStatus, now });
  const selectedClaim = claims.find((claim) => claim.id.toString() === claimId.trim());
  const stageIndex = product ? Number(product.stage) : null;
  const productCoverage = product ? coverage(product, now) : null;
  useTilt();

  function notify(scope: ActionScope, value: Feedback) {
    setFeedback({ ...value, scope });
    setToastVisible(true);
  }

  function fail(scope: ActionScope, error: unknown) {
    notify(scope, { kind: "error", message: errorMessage(error) });
  }

  function localFeedback(scope: ActionScope) {
    return <ActionFeedback feedback={feedback?.scope === scope ? feedback : null} label={`${scope} action status`} />;
  }

  function navigateToStep(step: GuideStep) {
    if (step.claimId) setClaimId(step.claimId);
    const field = document.getElementById(step.focus);
    const details = field?.closest("details");
    if (details) details.open = true;
    field?.scrollIntoView?.({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
    field?.focus({ preventScroll: true });
  }

  const guide = <NextStep step={nextStep} walletAddress={walletAddress} busy={busy} phase={transactionPhase} onNavigate={navigateToStep} />;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const wallet = window.ethereum;
    const invalidateWallet = () => {
      setWalletAddress("");
      setFeedback(null);
      setToastVisible(false);
      setStatusMessage(`Wallet account or network changed. Select ${targetNetwork.name} (${targetNetwork.chainId}) and reconnect before writing. Public verification is still available.`);
    };
    const events = ["accountsChanged", "chainChanged", "disconnect"];
    events.forEach((event) => wallet?.on?.(event, invalidateWallet));
    return () => events.forEach((event) => wallet?.removeListener?.(event, invalidateWallet));
  }, []);

  function clearProduct() {
    setProduct(null);
    setPendingTransfer(null);
    setClaims([]);
    setHistory([]);
  }

  function changeConnection(value: Connection) {
    clearProduct();
    setWalletAddress("");
    setFeedback(null);
    setToastVisible(false);
    setConnection(value);
    setStatusMessage("Team contract connected. Enter a product ID and serial number to query it.");
  }

  async function loadProduct(lookup: ProductLookup) {
    if (!readContract) {
      throw new Error("Deploy or configure a contract in Network setup first.");
    }
    const { productId: id, serialNumber: serial } = lookup;
    const result = asProduct(await readContract.getProduct(id, serial));
    const key = await readContract.getProductKey(id, serial);
    const transfer = await readContract.getPendingTransfer(id, serial);
    const ids = (await readContract.getClaimIds(id, serial)) as bigint[];
    const loadedClaims = await Promise.all(ids.map((claim) => readContract.getClaim(id, serial, claim)));
    const events = await getOwnershipEvents(readContract, key, connection.fromBlock);
    const loadedHistory = events.flatMap((event) => {
      const args = event.args;
      return [{
        label: "Ownership transferred",
        detail: `${String(args?.from)} → ${String(args?.to)}`,
        date: formatDate(String(args?.transferredAt))
      }];
    });
    setProduct(result);
    setPendingTransfer(transfer.exists ? (transfer as PendingTransfer) : null);
    setClaims(loadedClaims.map(asClaim));
    setHistory(loadedHistory);
    setNow(Math.floor(Date.now() / 1000));
  }

  async function refreshProduct(event?: FormEvent) {
    event?.preventDefault();
    if (!productId.trim() || !serialNumber.trim()) {
      fail("verify", new InputError("Enter the Product ID and Serial number, then click Verify product."));
      return;
    }
    setBusy(true);
    notify("verify", { kind: "pending", message: `Reading the product record on ${targetNetwork.name}…` });
    try {
      await loadProduct({ productId: productId.trim(), serialNumber: serialNumber.trim() });
      notify("verify", { kind: "success", message: "Product found and its on-chain record loaded. An on-chain registration alone does not prove the physical item is genuine." });
    } catch (error) {
      clearProduct();
      fail("verify", error);
    } finally {
      setBusy(false);
    }
  }

  async function connectWallet() {
    if (busy) return;
    setBusy(true);
    notify("wallet", { kind: "pending", message: "Choose an account in your wallet and allow this site to connect." });
    try {
      const { address } = await getWalletContract(connection);
      setWalletAddress(address);
      notify("wallet", { kind: "success", message: `Wallet connected: ${address}. Check that it matches the account selected in your wallet.` });
    } catch (error) {
      fail("wallet", error);
    } finally {
      setBusy(false);
    }
  }

  async function sendTransaction(
    scope: ActionScope,
    action: (contract: Contract, lookup: ProductLookup) => Promise<unknown>,
    success: string,
    lookup: ProductLookup | null = product,
    context?: string
  ) {
    if (busy) return;
    if (!lookup) {
      fail(scope, new InputError("Enter the product details and click Verify product to load the product first."));
      return;
    }
    setBusy(true);
    setTransactionPhase("signature");
    notify(scope, { kind: "pending", message: "Requesting a wallet signature. Check the account and network, then confirm the transaction." });
    let submitted = false;
    let hash: string | undefined;
    try {
      const { contract, address } = await getWalletContract(connection);
      setWalletAddress(address);
      const transaction = await action(contract, lookup);
      if (typeof transaction !== "object" || transaction === null || !("wait" in transaction)) {
        throw new Error("The wallet did not return a transaction to confirm. Check your wallet activity.");
      }
      submitted = true;
      hash = "hash" in transaction ? String(transaction.hash) : undefined;
      setTransactionPhase("confirmation");
      notify(scope, { kind: "pending", message: "Transaction submitted. Waiting for on-chain confirmation; do not send it again.", hash });
      const receipt = await (transaction as { wait: () => Promise<{ status: number | null } | null> }).wait();
      if (!receipt || receipt.status === null) {
        notify(scope, { kind: "warning", message: "Transaction submitted, but the result is not confirmed yet. Check your wallet activity and refresh the product; do not send it again.", hash });
        return;
      }
      if (receipt.status !== 1) throw new InputError("The transaction was mined but failed, so the product was not updated. Refresh the product and check your permissions and its status.");
      setProductId(lookup.productId);
      setSerialNumber(lookup.serialNumber);
      try {
        await loadProduct(lookup);
        notify(scope, { kind: "success", message: success, hash });
      } catch (error) {
        clearProduct();
        notify(scope, { kind: "warning", message: `Transaction confirmed, but the page could not refresh: ${errorMessage(error)} Click Verify product again; do not resend the transaction.`, hash });
      }
    } catch (error) {
      notify(scope, transactionFailure(error, submitted, hash, context));
    } finally {
      setBusy(false);
      setTransactionPhase(null);
    }
  }

  async function submitRegistration(event: FormEvent) {
    event.preventDefault();
    if (!registration.productId.trim() || !registration.serialNumber.trim() || !registration.model.trim()) {
      fail("register", new InputError("Enter the product ID, serial number and model in full; they cannot be only spaces."));
      return;
    }
    const seconds = Math.round(Number(registration.warrantyMonths) * 30 * 24 * 60 * 60);
    if (!/^[1-9]\d*$/.test(registration.warrantyMonths) || !Number.isSafeInteger(seconds) || !/^[1-9]\d*$/.test(registration.maxClaims) || !Number.isSafeInteger(Number(registration.maxClaims))) {
      fail("register", new InputError("Warranty months and claim limit must be whole numbers greater than zero and within a safe range."));
      return;
    }
    await sendTransaction(
      "register",
      (contract, lookup) =>
        contract.registerProduct(
          lookup.productId,
          lookup.serialNumber,
          registration.model.trim(),
          seconds,
          Number(registration.maxClaims)
        ),
      "Product registered and loaded. Next, the manufacturer starts the transfer to a retailer.",
      { productId: registration.productId.trim(), serialNumber: registration.serialNumber.trim() }
    );
  }

  async function initiateTransfer(event: FormEvent) {
    event.preventDefault();
    if (!isAddress(recipient.trim()) || getAddress(recipient.trim()) === ZeroAddress) {
      fail("transfer", new InputError("Enter the recipient's complete, valid, non-zero wallet address (starting with 0x)."));
      return;
    }
    await sendTransaction(
      "transfer",
      (contract, lookup) => contract.initiateTransfer(lookup.productId, lookup.serialNumber, recipient.trim()),
      "Transfer started; ownership has not changed yet. The recipient must switch to their own account and click Accept."
    );
  }

  async function processTransfer(action: "accept" | "reject" | "cancel" | "expire") {
    await sendTransaction(
      "transfer",
      (contract, { productId, serialNumber }) => {
        if (action === "accept") {
          return contract.acceptTransfer(productId, serialNumber);
        }
        if (action === "reject") {
          return contract.rejectTransfer(productId, serialNumber);
        }
        if (action === "cancel") {
          return contract.cancelTransfer(productId, serialNumber);
        }
        return contract.expireTransfer(productId, serialNumber);
      },
      { accept: "Transfer accepted; ownership updated.", reject: "Transfer rejected; ownership unchanged.", cancel: "Transfer cancelled; ownership unchanged.", expire: "Expired transfer cleared; the current owner can start a new transfer." }[action],
      product,
      action
    );
  }

  async function submitClaim(event: FormEvent) {
    event.preventDefault();
    await sendTransaction(
      "claim",
      (contract, lookup) => contract.submitClaim(lookup.productId, lookup.serialNumber, Number(problemType)),
      "Claim submitted. Waiting for a service center to review it."
    );
  }

  async function processClaim(action: "approve" | "reject" | "service") {
    if (!/^[1-9]\d*$/.test(claimId.trim()) || BigInt(claimId.trim()) >= 2n ** 256n) {
      fail("service", new InputError("Enter a valid positive whole-number Claim ID; see the numbers in Claim history below."));
      return;
    }
    const id = BigInt(claimId.trim());
    await sendTransaction(
      "service",
      (contract, { productId, serialNumber }) => {
        if (action === "approve") {
          return contract.approveClaim(productId, serialNumber, id);
        }
        if (action === "reject") {
          return contract.rejectClaim(productId, serialNumber, id);
        }
        return contract.completeServicing(productId, serialNumber, id, Number(serviceResult));
      },
      { approve: "Claim approved; the approved-claim count has increased. After the actual service, choose a result and click Complete.", reject: "Claim rejected. No warranty claim was used; the eligible current owner can submit again.", service: "Service result recorded; this claim is complete." }[action]
    );
  }

  return (
    <main className="shell">
      <div className="backdrop" aria-hidden="true">
        <span className="aurora aurora-a" />
        <span className="aurora aurora-b" />
        <span className="aurora aurora-c" />
        <span className="grid-floor" />
        <span className="grain" />
      </div>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <span className="mini-cube">{faceNames.map((face) => <i className={`mini-${face}`} key={face} />)}</span>
          </span>
          <span>Trace / Warranty</span>
        </div>
        <div className="topbar-actions">
          <span className={`network-chip ${connection.address ? "is-live" : ""}`}>
            <span className="chip-dot" aria-hidden="true" />
            {targetNetwork.name}
          </span>
          <button className={`wallet-button ${walletAddress ? "is-connected" : ""}`} disabled={busy} onClick={connectWallet} type="button">
            {walletAddress ? shortAddress(walletAddress) : "Connect wallet"}
          </button>
        </div>
      </header>
      {localFeedback("wallet")}

      <section className="hero" data-tilt="18">
        <div className="hero-text">
          <p className="eyebrow">{targetNetwork.name.toUpperCase()} DEMO · COMP5565</p>
          <h1>Trust the trail.<br /><em>Own the next step.</em></h1>
          <p className="hero-copy">
            Verify a product’s provenance in public, then use a connected wallet only when a role needs to write to the contract.
          </p>
          <div className="hero-note">
            <span className="pulse" />
            <span>Public verification does not require a wallet.</span>
          </div>
          <ul className="hero-points">
            <li><b>Immutable</b> registry facts</li>
            <li><b>Two-step</b> ownership handoff</li>
            <li><b>Capped</b> warranty claims</li>
          </ul>
        </div>
        <ChainScene stage={stageIndex} />
      </section>

      <DeploymentPanel connection={connection} onChange={changeConnection} disabled={busy} onFeedback={(value) => notify("setup", value)} />
      {!product && guide}

      <section className={`verify-card ${!product && nextStep.target === "verify" ? "guide-target" : ""}`}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">01 / VERIFY</p>
            <h2>Find a product</h2>
          </div>
          <span className="read-only">READ ONLY</span>
        </div>
        <form className="verify-form" noValidate onSubmit={refreshProduct}>
          <label>
            Product ID
            <input id="product-id" value={productId} onChange={(event) => setProductId(event.target.value)} placeholder="DEMO-001" required />
          </label>
          <label>
            Serial number
            <input value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} placeholder="SN-DEMO-001" required />
          </label>
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "Reading…" : "Verify product"}
          </button>
        </form>
        {!feedback && <p className="status-line" role="status" aria-label="Product status">{statusMessage}</p>}
        {localFeedback("verify")}
      </section>

      {product && (
        <section className="product-grid">
          <article className="product-card spotlight" data-tilt="7">
            <span className="holo" aria-hidden="true" />
            <div className="card-topline">
              <span className="tag">REGISTERED ON CHAIN</span>
              <span className={`status-dot ${warrantyStatus === "Active" ? "active" : ""}`} />
            </div>
            <h2>{product.model}</h2>
            <p className="product-code">{product.productId} / {product.serialNumber}</p>
            <ol className="stage-track" aria-label="Ownership stage">
              {ownershipStages.map((label, index) => (
                <li className={index < Number(product.stage) ? "done" : index === Number(product.stage) ? "current" : ""} aria-current={index === Number(product.stage) ? "step" : undefined} key={label}>
                  <span className="stage-node" aria-hidden="true" />{label}
                </li>
              ))}
            </ol>
            {productCoverage && <div className={`coverage ${productCoverage.waiting ? "coverage-waiting" : ""}`}>
              <div className="coverage-head"><span>Warranty period</span><span>{productCoverage.label}</span></div>
              <div className="coverage-track" aria-hidden="true"><span style={{ width: `${productCoverage.remaining * 100}%` }} /></div>
            </div>}
            <div className="facts">
              <div><span>Manufacturer</span><strong className="wallet-address">{product.manufacturer}</strong></div>
              <div><span>Current owner</span><strong className="wallet-address">{product.currentOwner}</strong></div>
              <div><span>Warranty</span><strong>{warrantyStatus}</strong></div>
              <div>
                <span>Claims used</span><strong>{product.approvedClaims.toString()} / {product.maxClaims.toString()}</strong>
                {product.maxClaims <= 12n && <i className="claim-pips" aria-hidden="true">
                  {Array.from({ length: Number(product.maxClaims) }, (_, index) => <b className={BigInt(index) < product.approvedClaims ? "used" : ""} key={index} />)}
                </i>}
              </div>
              <div><span>Warranty start</span><strong>{formatDate(product.warrantyStart)}</strong></div>
              <div><span>Warranty end</span><strong>{formatDate(product.warrantyEnd)}</strong></div>
              <div><span>Warranty duration</span><strong>{Number(product.warrantyDuration) / 86400} {product.warrantyDuration === 86400n ? "day" : "days"}</strong></div>
            </div>
          </article>
          <article className="product-card timeline-card" data-tilt="5">
            <div className="card-topline"><span className="tag">OWNERSHIP TRAIL</span></div>
            <div className="timeline">
              <div className="timeline-item"><span className="timeline-dot" /><div><strong>Registered by manufacturer</strong><small>{formatDate(product.registeredAt)}</small></div></div>
              {history.length ? history.map((item, index) => <div className="timeline-item" key={`${item.date}-${index}`}><span className="timeline-dot" /><div><strong>{item.label}</strong><small>{item.detail} · {item.date}</small></div></div>) : <p className="muted">No completed transfers yet.</p>}
            </div>
          </article>
        </section>
      )}

      <section className="workbench">
        <div className="section-heading">
          <div>
            <p className="eyebrow">02 / ROLE WORKBENCH</p>
            <h2>Write to the contract</h2>
          </div>
          <span className="write-only">WALLET REQUIRED</span>
        </div>
        {product && <p className="inline-help">Actions below apply to {product.productId} / {product.serialNumber}, the loaded product.</p>}
        {product && guide}
        <div className="workbench-grid">
          <article className="tool-card" data-tilt="6">
            <div className="tool-head"><span className="tool-number">A</span><ToolIcon name="register" /></div>
            <h3>Register product</h3>
            <p>Manufacturer only. Core product facts are immutable after registration.</p>
            <p className="card-guide">Use an authorized manufacturer account and an unused ID pair. 24 months = 720 days. The product loads automatically after registration.</p>
            <form noValidate onSubmit={submitRegistration}>
              <input id="registration-product-id" aria-label="Registration product ID" value={registration.productId} onChange={(event) => setRegistration({ ...registration, productId: event.target.value })} placeholder="Product ID" required />
              <input aria-label="Registration serial number" value={registration.serialNumber} onChange={(event) => setRegistration({ ...registration, serialNumber: event.target.value })} placeholder="Serial number" required />
              <input aria-label="Model" value={registration.model} onChange={(event) => setRegistration({ ...registration, model: event.target.value })} placeholder="Model" required />
              <div className="split-inputs"><input aria-label="Warranty months (30 days each)" value={registration.warrantyMonths} onChange={(event) => setRegistration({ ...registration, warrantyMonths: event.target.value })} type="number" min="1" placeholder="Months" required /><input aria-label="Maximum approved claims" value={registration.maxClaims} onChange={(event) => setRegistration({ ...registration, maxClaims: event.target.value })} type="number" min="1" placeholder="Max claims" required /></div>
              <button className="secondary-button" disabled={busy} type="submit">Register product</button>
            </form>
            {localFeedback("register")}
          </article>

          <article className={`tool-card ${product && nextStep.target === "transfer" ? "guide-target" : ""}`} data-tilt="6">
            <div className="tool-head"><span className="tool-number">B</span><ToolIcon name="transfer" /></div>
            <h3>Transfer ownership</h3>
            <p>Two steps keep accidental transfers from changing the owner.</p>
            <p className="card-guide">{!product ? "Verify a product first, then enter the recipient's full wallet address." : pendingTransfer ? now > Number(pendingTransfer.deadline) ? "Expired: click Expire to clear it, then the original owner can start again." : "Next, the recipient switches to their own account and clicks Accept; the sender does not click Start transfer again." : product.stage === 0n ? "The current owner enters an authorized retailer's address, then clicks Start transfer." : "The current owner enters the new customer's address, then clicks Start transfer; ownership moves only after the recipient accepts."}</p>
            <form noValidate onSubmit={initiateTransfer}>
              <input id="transfer-recipient" aria-label="Recipient wallet address" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Recipient wallet address" required />
              <button className="secondary-button" disabled={busy} type="submit">Start transfer</button>
            </form>
            {pendingTransfer && (
              <div className="pending-transfer">
                <strong>Pending recipient: {shortAddress(pendingTransfer.to)}</strong>
                <small>Deadline: {formatDate(pendingTransfer.deadline)}</small>
                <div className="button-row">
                  <button id="accept-transfer" className="small-button" disabled={busy} onClick={() => processTransfer("accept")} type="button">Accept</button>
                  <button className="small-button muted-button" disabled={busy} onClick={() => processTransfer("reject")} type="button">Reject</button>
                </div>
                <div className="button-row">
                  <button className="small-button muted-button" disabled={busy} onClick={() => processTransfer("cancel")} type="button">Cancel</button>
                  <button id="expire-transfer" className="small-button muted-button" disabled={busy} onClick={() => processTransfer("expire")} type="button">Expire</button>
                </div>
              </div>
            )}
            <div className="inline-help">The recipient confirms from their own wallet. A transfer expires after the configured deadline.</div>
            {localFeedback("transfer")}
          </article>

          <article className={`tool-card ${product && nextStep.target === "claim" ? "guide-target" : ""}`} data-tilt="6">
            <div className="tool-head"><span className="tool-number">C</span><ToolIcon name="claim" /></div>
            <h3>Submit a claim</h3>
            <p>Only the current owner can open one pending claim at a time.</p>
            <p className="card-guide">{!product ? "Verify a product first; claims open once the first customer accepts it." : activeClaim ? `Claim #${activeClaim.id} is already pending. Let a service center handle it; do not submit again.` : warrantyStatus === "Active" ? "Only submit when there is a fault: use the current owner account, choose a problem type, then click Submit claim." : "The warranty is not active, has expired, or has no claims left, so new claims are unavailable."}</p>
            <form onSubmit={submitClaim}>
              <select id="problem-type" aria-label="Problem type" value={problemType} onChange={(event) => setProblemType(event.target.value)}>
                {problemTypes.map((item, index) => <option key={item} value={index}>{item}</option>)}
              </select>
              <button className="secondary-button" disabled={busy} type="submit">Submit claim</button>
            </form>
            {localFeedback("claim")}
            {activeClaim && <div className="inline-help">Pending claim #{activeClaim.id.toString()} is waiting for a service center.</div>}
          </article>

          <article className={`tool-card ${product && nextStep.target === "service" ? "guide-target" : ""}`} data-tilt="6">
            <div className="tool-head"><span className="tool-number">D</span><ToolIcon name="service" /></div>
            <h3>Process a claim</h3>
            <p>Service centers approve, reject, or complete approved work.</p>
            <p className="card-guide">{selectedClaim?.status === 3n ? "This claim is approved: after the actual service, choose a result below and click Complete. No need to Approve again." : selectedClaim?.status === 1n ? "This claim is pending: a service center clicks Approve or Reject. After approval, record the actual service result." : selectedClaim ? "This claim is already finished. To process another one, enter its number." : "Enter a Claim ID from the history below, or let the guide fill it in. Approve first, then click Complete after the actual service."}</p>
            <input id="claim-id" aria-label="Claim ID" value={claimId} onChange={(event) => setClaimId(event.target.value)} placeholder="Claim ID" inputMode="numeric" />
            <div className="button-row"><button className="small-button" disabled={busy} onClick={() => processClaim("approve")} type="button">Approve</button><button className="small-button muted-button" disabled={busy} onClick={() => processClaim("reject")} type="button">Reject</button></div>
            <div className="service-row"><select id="service-result" aria-label="Service result" value={serviceResult} onChange={(event) => setServiceResult(event.target.value)}>{serviceResults.slice(1).map((item, index) => <option key={item} value={index + 1}>{item}</option>)}</select><button className="small-button" disabled={busy} onClick={() => processClaim("service")} type="button">Complete</button></div>
            {localFeedback("service")}
          </article>
        </div>
      </section>

      {claims.length > 0 && (
        <section className="claims-section">
          <div className="section-heading"><div><p className="eyebrow">03 / CLAIM HISTORY</p><h2>Every decision stays visible</h2></div></div>
          <div className="claim-list">
            {claims.map((claim) => (
              <div className="claim-row" key={claim.id.toString()}>
                <div className="claim-summary"><span className="claim-id">#{claim.id.toString()}</span><strong className={`claim-status status-${claimStatuses[Number(claim.status)].toLowerCase()}`}>{claimStatuses[Number(claim.status)]}</strong><span>{problemTypes[Number(claim.problemType)]}</span><span>{formatDate(claim.submittedAt)}</span><span>{claim.serviceResult ? serviceResults[Number(claim.serviceResult)] : "—"}</span></div>
                <div className="claim-details">
                  <span>Applicant: {claim.applicantOwner}</span>
                  {claim.processedAt > 0n && <span>{Number(claim.status) === 5 ? "Cancelled by recipient" : "Processed by"}: {claim.processedBy} · {formatDate(claim.processedAt)}</span>}
                  {claim.servicedAt > 0n && <span>Serviced by: {claim.servicedBy} · {formatDate(claim.servicedAt)}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer><span>TRACE / WARRANTY</span><span>{connection.address ? `${targetNetwork.name} · Contract ${shortAddress(connection.address)}` : `${targetNetwork.name} · No contract connected`}</span></footer>
      {feedback && toastVisible && <aside className="feedback-toast" aria-label="Notifications">
        <ActionFeedback feedback={feedback} announce={false} />
        {feedback.kind !== "pending" && <button className="feedback-close" type="button" aria-label="Dismiss notification" onClick={() => setToastVisible(false)}>×</button>}
      </aside>}
    </main>
  );
}

export default App;
