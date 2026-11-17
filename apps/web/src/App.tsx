import { FormEvent, useMemo, useState } from "react";
import { Contract } from "ethers";
import { CONTRACT_ABI, contractAddress, getReadContract, getWalletContract } from "./contract";
import { claimStatuses, formatDate, formatWarrantyStatus, problemTypes, serviceResults, shortAddress } from "./format";
import "./styles.css";

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

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.split("\n")[0];
  }
  return "Transaction failed. Check the wallet network and try again.";
}

function App() {
  const [productId, setProductId] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [pendingTransfer, setPendingTransfer] = useState<PendingTransfer | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [walletAddress, setWalletAddress] = useState("");
  const [statusMessage, setStatusMessage] = useState("Enter a product ID and serial number to begin.");
  const [busy, setBusy] = useState(false);
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

  const readContract = useMemo(() => getReadContract(), []);
  const activeClaim = claims.find((claim) => Number(claim.status) === 1);

  async function refreshProduct(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setStatusMessage("Reading the local chain…");
    try {
      if (!readContract) {
        setProduct(null);
        setPendingTransfer(null);
        setClaims([]);
        setHistory([]);
        setStatusMessage("Set VITE_CONTRACT_ADDRESS after deploying the local contract.");
        return;
      }
      const result = asProduct(await readContract.getProduct(productId.trim(), serialNumber.trim()));
      const key = await readContract.getProductKey(productId.trim(), serialNumber.trim());
      const transfer = await readContract.getPendingTransfer(productId.trim(), serialNumber.trim());
      const ids = (await readContract.getClaimIds(productId.trim(), serialNumber.trim())) as bigint[];
      const loadedClaims = await Promise.all(ids.map((id) => readContract.getClaim(productId.trim(), serialNumber.trim(), id)));
      const events = await readContract.queryFilter(readContract.filters.OwnershipTransferred(key));
      const loadedHistory = events.flatMap((event) => {
        if (!("args" in event)) {
          return [];
        }
        const args = event.args;
        return [{
          label: "Ownership transferred",
          detail: `${shortAddress(String(args?.from))} → ${shortAddress(String(args?.to))}`,
          date: formatDate(String(args?.transferredAt))
        }];
      });
      setProduct(result);
      setPendingTransfer(transfer.exists ? (transfer as PendingTransfer) : null);
      setClaims(loadedClaims.map(asClaim));
      setHistory(loadedHistory);
      setStatusMessage("Product verified from the contract.");
    } catch (error) {
      setProduct(null);
      setPendingTransfer(null);
      setClaims([]);
      setHistory([]);
      setStatusMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function connectWallet() {
    try {
      const { address } = await getWalletContract();
      setWalletAddress(address);
      setStatusMessage(`Wallet connected: ${shortAddress(address)}`);
    } catch (error) {
      setStatusMessage(errorMessage(error));
    }
  }

  async function sendTransaction(action: (contract: Contract) => Promise<unknown>, message: string) {
    setBusy(true);
    setStatusMessage(message);
    try {
      const { contract, address } = await getWalletContract();
      setWalletAddress(address);
      const transaction = await action(contract);
      if (typeof transaction === "object" && transaction !== null && "wait" in transaction) {
        await (transaction as { wait: () => Promise<unknown> }).wait();
      }
      setStatusMessage("Transaction confirmed.");
      await refreshProduct();
    } catch (error) {
      setStatusMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitRegistration(event: FormEvent) {
    event.preventDefault();
    setProductId(registration.productId);
    setSerialNumber(registration.serialNumber);
    const seconds = Math.round(Number(registration.warrantyMonths) * 30 * 24 * 60 * 60);
    await sendTransaction(
      (contract) =>
        contract.registerProduct(
          registration.productId,
          registration.serialNumber,
          registration.model,
          seconds,
          Number(registration.maxClaims)
        ),
      "Waiting for the manufacturer registration transaction…"
    );
  }

  async function initiateTransfer(event: FormEvent) {
    event.preventDefault();
    await sendTransaction(
      (contract) => contract.initiateTransfer(productId, serialNumber, recipient),
      "Waiting for transfer initiation…"
    );
  }

  async function processTransfer(action: "accept" | "reject" | "cancel" | "expire") {
    await sendTransaction(
      (contract) => {
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
      "Waiting for the transfer transaction…"
    );
  }

  async function submitClaim(event: FormEvent) {
    event.preventDefault();
    await sendTransaction(
      (contract) => contract.submitClaim(productId, serialNumber, Number(problemType)),
      "Waiting for claim submission…"
    );
  }

  async function processClaim(action: "approve" | "reject" | "service") {
    const id = Number(claimId);
    await sendTransaction(
      (contract) => {
        if (action === "approve") {
          return contract.approveClaim(productId, serialNumber, id);
        }
        if (action === "reject") {
          return contract.rejectClaim(productId, serialNumber, id);
        }
        return contract.completeServicing(productId, serialNumber, id, Number(serviceResult));
      },
      "Waiting for the service center transaction…"
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">T/W</span>
          <span>Trace / Warranty</span>
        </div>
        <button className="wallet-button" onClick={connectWallet} type="button">
          {walletAddress ? shortAddress(walletAddress) : "Connect wallet"}
        </button>
      </header>

      <section className="hero">
        <p className="eyebrow">LOCAL ETHEREUM DEMO · COMP5565</p>
        <h1>Trust the trail.<br /><em>Own the next step.</em></h1>
        <p className="hero-copy">
          Verify a product’s provenance in public, then use a connected wallet only when a role needs to write to the contract.
        </p>
        <div className="hero-note">
          <span className="pulse" />
          <span>Public verification does not require a wallet.</span>
        </div>
      </section>

      <section className="verify-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">01 / VERIFY</p>
            <h2>Find a product</h2>
          </div>
          <span className="read-only">READ ONLY</span>
        </div>
        <form className="verify-form" onSubmit={refreshProduct}>
          <label>
            Product ID
            <input value={productId} onChange={(event) => setProductId(event.target.value)} placeholder="DEMO-001" required />
          </label>
          <label>
            Serial number
            <input value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} placeholder="SN-DEMO-001" required />
          </label>
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "Reading…" : "Verify product"}
          </button>
        </form>
        <p className="status-line" role="status">{statusMessage}</p>
      </section>

      {product && (
        <section className="product-grid">
          <article className="product-card spotlight">
            <div className="card-topline">
              <span className="tag">VERIFIED ON CHAIN</span>
              <span className={`status-dot ${formatWarrantyStatus(product.warrantyStart, product.warrantyEnd) === "Active" ? "active" : ""}`} />
            </div>
            <h2>{product.model}</h2>
            <p className="product-code">{product.productId} / {product.serialNumber}</p>
            <div className="facts">
              <div><span>Manufacturer</span><strong>{shortAddress(product.manufacturer)}</strong></div>
              <div><span>Current owner</span><strong>{shortAddress(product.currentOwner)}</strong></div>
              <div><span>Warranty</span><strong>{formatWarrantyStatus(product.warrantyStart, product.warrantyEnd)}</strong></div>
              <div><span>Claims used</span><strong>{product.approvedClaims.toString()} / {product.maxClaims.toString()}</strong></div>
            </div>
          </article>
          <article className="product-card timeline-card">
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
        <div className="workbench-grid">
          <article className="tool-card">
            <span className="tool-number">A</span>
            <h3>Register product</h3>
            <p>Manufacturer only. Core product facts are immutable after registration.</p>
            <form onSubmit={submitRegistration}>
              <input value={registration.productId} onChange={(event) => setRegistration({ ...registration, productId: event.target.value })} placeholder="Product ID" required />
              <input value={registration.serialNumber} onChange={(event) => setRegistration({ ...registration, serialNumber: event.target.value })} placeholder="Serial number" required />
              <input value={registration.model} onChange={(event) => setRegistration({ ...registration, model: event.target.value })} placeholder="Model" required />
              <div className="split-inputs"><input value={registration.warrantyMonths} onChange={(event) => setRegistration({ ...registration, warrantyMonths: event.target.value })} type="number" min="1" placeholder="Months" /><input value={registration.maxClaims} onChange={(event) => setRegistration({ ...registration, maxClaims: event.target.value })} type="number" min="1" placeholder="Max claims" /></div>
              <button className="secondary-button" type="submit">Register product</button>
            </form>
          </article>

          <article className="tool-card">
            <span className="tool-number">B</span>
            <h3>Transfer ownership</h3>
            <p>Two steps keep accidental transfers from changing the owner.</p>
            <form onSubmit={initiateTransfer}>
              <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Recipient wallet address" required />
              <button className="secondary-button" type="submit">Start transfer</button>
            </form>
            {pendingTransfer && (
              <div className="pending-transfer">
                <strong>Pending recipient: {shortAddress(pendingTransfer.to)}</strong>
                <small>Deadline: {formatDate(pendingTransfer.deadline)}</small>
                <div className="button-row">
                  <button className="small-button" onClick={() => processTransfer("accept")} type="button">Accept</button>
                  <button className="small-button muted-button" onClick={() => processTransfer("reject")} type="button">Reject</button>
                </div>
                <div className="button-row">
                  <button className="small-button muted-button" onClick={() => processTransfer("cancel")} type="button">Cancel</button>
                  <button className="small-button muted-button" onClick={() => processTransfer("expire")} type="button">Expire</button>
                </div>
              </div>
            )}
            <div className="inline-help">The recipient confirms from their own wallet. A transfer expires after the configured deadline.</div>
          </article>

          <article className="tool-card">
            <span className="tool-number">C</span>
            <h3>Submit a claim</h3>
            <p>Only the current owner can open one pending claim at a time.</p>
            <form onSubmit={submitClaim}>
              <select value={problemType} onChange={(event) => setProblemType(event.target.value)}>
                {problemTypes.map((item, index) => <option key={item} value={index}>{item}</option>)}
              </select>
              <button className="secondary-button" type="submit">Submit claim</button>
            </form>
            {activeClaim && <div className="inline-help">Pending claim #{activeClaim.id.toString()} is waiting for a service center.</div>}
          </article>

          <article className="tool-card">
            <span className="tool-number">D</span>
            <h3>Process a claim</h3>
            <p>Service centers approve, reject, or complete approved work.</p>
            <input value={claimId} onChange={(event) => setClaimId(event.target.value)} placeholder="Claim ID" inputMode="numeric" />
            <div className="button-row"><button className="small-button" onClick={() => processClaim("approve")} type="button">Approve</button><button className="small-button muted-button" onClick={() => processClaim("reject")} type="button">Reject</button></div>
            <div className="service-row"><select value={serviceResult} onChange={(event) => setServiceResult(event.target.value)}>{serviceResults.slice(1).map((item, index) => <option key={item} value={index + 1}>{item}</option>)}</select><button className="small-button" onClick={() => processClaim("service")} type="button">Complete</button></div>
          </article>
        </div>
      </section>

      {claims.length > 0 && (
        <section className="claims-section">
          <div className="section-heading"><div><p className="eyebrow">03 / CLAIM HISTORY</p><h2>Every decision stays visible</h2></div></div>
          <div className="claim-list">
            {claims.map((claim) => <div className="claim-row" key={claim.id.toString()}><span className="claim-id">#{claim.id.toString()}</span><strong>{claimStatuses[Number(claim.status)]}</strong><span>{problemTypes[Number(claim.problemType)]}</span><span>{formatDate(claim.submittedAt)}</span><span>{claim.serviceResult ? serviceResults[Number(claim.serviceResult)] : "—"}</span></div>)}
          </div>
        </section>
      )}

      <footer><span>TRACE / WARRANTY</span><span>{contractAddress ? `Contract ${shortAddress(contractAddress)}` : "Local contract not configured"}</span></footer>
    </main>
  );
}

export default App;
