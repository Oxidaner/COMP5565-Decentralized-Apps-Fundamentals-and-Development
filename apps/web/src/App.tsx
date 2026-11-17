import { FormEvent, useEffect, useMemo, useState } from "react";
import { Contract, getAddress, isAddress, ZeroAddress } from "ethers";
import { getOwnershipEvents, getReadContract, getWalletContract } from "./contract";
import { Connection, loadConnection, targetNetwork } from "./network";
import DeploymentPanel from "./DeploymentPanel";
import NextStep, { getNextStep, GuideStep } from "./NextStep";
import ActionFeedback, { Feedback } from "./ActionFeedback";
import { errorMessage, InputError, transactionFailure } from "./errors";
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
      fail("verify", new InputError("请填写 Product ID 和 Serial number，再点 Verify product。"));
      return;
    }
    setBusy(true);
    notify("verify", { kind: "pending", message: `正在读取 ${targetNetwork.name} 上的产品记录…` });
    try {
      await loadProduct({ productId: productId.trim(), serialNumber: serialNumber.trim() });
      notify("verify", { kind: "success", message: "产品查询成功，已加载链上记录。链上登记本身不代表实物一定为真品。" });
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
    notify("wallet", { kind: "pending", message: "请在钱包中选择账户并允许连接当前网站。" });
    try {
      const { address } = await getWalletContract(connection);
      setWalletAddress(address);
      notify("wallet", { kind: "success", message: `钱包连接成功：${address}。请与钱包当前账户核对。` });
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
      fail(scope, new InputError("请先填写产品信息并点 Verify product，加载产品后再操作。"));
      return;
    }
    setBusy(true);
    setTransactionPhase("signature");
    notify(scope, { kind: "pending", message: "正在请求钱包签名，请核对账户与网络并确认交易。" });
    let submitted = false;
    let hash: string | undefined;
    try {
      const { contract, address } = await getWalletContract(connection);
      setWalletAddress(address);
      const transaction = await action(contract, lookup);
      if (typeof transaction !== "object" || transaction === null || !("wait" in transaction)) {
        throw new Error("钱包没有返回可确认的交易，请检查钱包活动记录。");
      }
      submitted = true;
      hash = "hash" in transaction ? String(transaction.hash) : undefined;
      setTransactionPhase("confirmation");
      notify(scope, { kind: "pending", message: "交易已提交，正在等待链上确认，请勿重复发送。", hash });
      const receipt = await (transaction as { wait: () => Promise<{ status: number | null } | null> }).wait();
      if (!receipt || receipt.status === null) {
        notify(scope, { kind: "warning", message: "交易已提交，但尚未确认结果。请查看钱包活动记录并刷新产品，不要重复发送。", hash });
        return;
      }
      if (receipt.status !== 1) throw new InputError("交易已上链但执行失败，产品状态未按此次操作更新。请刷新产品并核对操作权限与状态。");
      setProductId(lookup.productId);
      setSerialNumber(lookup.serialNumber);
      try {
        await loadProduct(lookup);
        notify(scope, { kind: "success", message: success, hash });
      } catch (error) {
        clearProduct();
        notify(scope, { kind: "warning", message: `交易已确认成功，但页面刷新失败：${errorMessage(error)} 请重新点 Verify product，不要重复发送交易。`, hash });
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
      fail("register", new InputError("请完整填写产品编号、序列号和型号，内容不能只有空格。"));
      return;
    }
    const seconds = Math.round(Number(registration.warrantyMonths) * 30 * 24 * 60 * 60);
    if (!/^[1-9]\d*$/.test(registration.warrantyMonths) || !Number.isSafeInteger(seconds) || !/^[1-9]\d*$/.test(registration.maxClaims) || !Number.isSafeInteger(Number(registration.maxClaims))) {
      fail("register", new InputError("保修月数和理赔上限必须是大于零的整数，且不能超过可安全表示的范围。"));
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
      "产品登记成功，已自动载入新产品。下一步由制造商发起转给零售商的转让。",
      { productId: registration.productId.trim(), serialNumber: registration.serialNumber.trim() }
    );
  }

  async function initiateTransfer(event: FormEvent) {
    event.preventDefault();
    if (!isAddress(recipient.trim()) || getAddress(recipient.trim()) === ZeroAddress) {
      fail("transfer", new InputError("请填写接收方完整、有效且非零的钱包地址（0x 开头）。"));
      return;
    }
    await sendTransaction(
      "transfer",
      (contract, lookup) => contract.initiateTransfer(lookup.productId, lookup.serialNumber, recipient.trim()),
      "转让发起成功，所有权尚未改变。请指定接收方切换账户后点 Accept 确认。"
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
      { accept: "转让接收成功，所有权已更新。", reject: "转让已拒绝，所有权保持不变。", cancel: "转让已取消，所有权保持不变。", expire: "超时转让已清理，当前所有者可以重新发起转让。" }[action],
      product,
      action
    );
  }

  async function submitClaim(event: FormEvent) {
    event.preventDefault();
    await sendTransaction(
      "claim",
      (contract, lookup) => contract.submitClaim(lookup.productId, lookup.serialNumber, Number(problemType)),
      "理赔申请已提交成功，请等待服务中心审批。"
    );
  }

  async function processClaim(action: "approve" | "reject" | "service") {
    if (!/^[1-9]\d*$/.test(claimId.trim()) || BigInt(claimId.trim()) >= 2n ** 256n) {
      fail("service", new InputError("请输入有效的正整数 Claim ID，请参考下方 Claim history 的编号。"));
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
      { approve: "理赔已批准，获批次数已增加。实际服务完成后请选择结果并点 Complete。", reject: "理赔已拒绝，不消耗保修次数；符合条件的当前所有者可以重新申请。", service: "维修结果登记成功，这笔理赔已完成。" }[action]
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">T/W</span>
          <span>Trace / Warranty</span>
        </div>
        <button className="wallet-button" disabled={busy} onClick={connectWallet} type="button">
          {walletAddress ? shortAddress(walletAddress) : "Connect wallet"}
        </button>
      </header>
      {localFeedback("wallet")}

      <section className="hero">
        <p className="eyebrow">{targetNetwork.name.toUpperCase()} DEMO · COMP5565</p>
        <h1>Trust the trail.<br /><em>Own the next step.</em></h1>
        <p className="hero-copy">
          Verify a product’s provenance in public, then use a connected wallet only when a role needs to write to the contract.
        </p>
        <div className="hero-note">
          <span className="pulse" />
          <span>Public verification does not require a wallet.</span>
        </div>
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
          <article className="product-card spotlight">
            <div className="card-topline">
              <span className="tag">REGISTERED ON CHAIN</span>
              <span className={`status-dot ${warrantyStatus === "Active" ? "active" : ""}`} />
            </div>
            <h2>{product.model}</h2>
            <p className="product-code">{product.productId} / {product.serialNumber}</p>
            <div className="facts">
              <div><span>Manufacturer</span><strong className="wallet-address">{product.manufacturer}</strong></div>
              <div><span>Current owner</span><strong className="wallet-address">{product.currentOwner}</strong></div>
              <div><span>Warranty</span><strong>{warrantyStatus}</strong></div>
              <div><span>Claims used</span><strong>{product.approvedClaims.toString()} / {product.maxClaims.toString()}</strong></div>
              <div><span>Warranty start</span><strong>{formatDate(product.warrantyStart)}</strong></div>
              <div><span>Warranty end</span><strong>{formatDate(product.warrantyEnd)}</strong></div>
              <div><span>Warranty duration</span><strong>{Number(product.warrantyDuration) / 86400} {product.warrantyDuration === 86400n ? "day" : "days"}</strong></div>
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
        {product && <p className="inline-help">Actions below apply to {product.productId} / {product.serialNumber}, the loaded product.</p>}
        {product && guide}
        <div className="workbench-grid">
          <article className="tool-card">
            <span className="tool-number">A</span>
            <h3>Register product</h3>
            <p>Manufacturer only. Core product facts are immutable after registration.</p>
            <p className="card-guide" lang="zh-CN">使用已授权制造商账户，填写未使用的编号；24 个月按 720 天计算。登记后会自动载入产品。</p>
            <form noValidate onSubmit={submitRegistration}>
              <input id="registration-product-id" aria-label="Registration product ID" value={registration.productId} onChange={(event) => setRegistration({ ...registration, productId: event.target.value })} placeholder="Product ID" required />
              <input aria-label="Registration serial number" value={registration.serialNumber} onChange={(event) => setRegistration({ ...registration, serialNumber: event.target.value })} placeholder="Serial number" required />
              <input aria-label="Model" value={registration.model} onChange={(event) => setRegistration({ ...registration, model: event.target.value })} placeholder="Model" required />
              <div className="split-inputs"><input aria-label="Warranty months (30 days each)" value={registration.warrantyMonths} onChange={(event) => setRegistration({ ...registration, warrantyMonths: event.target.value })} type="number" min="1" placeholder="Months" required /><input aria-label="Maximum approved claims" value={registration.maxClaims} onChange={(event) => setRegistration({ ...registration, maxClaims: event.target.value })} type="number" min="1" placeholder="Max claims" required /></div>
              <button className="secondary-button" disabled={busy} type="submit">Register product</button>
            </form>
            {localFeedback("register")}
          </article>

          <article className={`tool-card ${product && nextStep.target === "transfer" ? "guide-target" : ""}`}>
            <span className="tool-number">B</span>
            <h3>Transfer ownership</h3>
            <p>Two steps keep accidental transfers from changing the owner.</p>
            <p className="card-guide" lang="zh-CN">{!product ? "先查询产品，再填写接收方的完整钱包地址。" : pendingTransfer ? now > Number(pendingTransfer.deadline) ? "已超时：先点 Expire 清理，再由原所有者重新发起。" : "下一步由接收方换自己的账户点 Accept；发起人不用再点 Start transfer。" : product.stage === 0n ? "当前所有者填写已授权零售商地址，再点 Start transfer。" : "当前所有者填写新消费者地址，再点 Start transfer；接收方确认后才转移。"}</p>
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

          <article className={`tool-card ${product && nextStep.target === "claim" ? "guide-target" : ""}`}>
            <span className="tool-number">C</span>
            <h3>Submit a claim</h3>
            <p>Only the current owner can open one pending claim at a time.</p>
            <p className="card-guide" lang="zh-CN">{!product ? "先查询产品；首次消费者接收后才能申请保修。" : activeClaim ? `已有待处理申请 #${activeClaim.id}，先交给服务中心处理，不要重复提交。` : warrantyStatus === "Active" ? "有故障才需申请：使用当前所有者账户，选问题类型后点 Submit claim。" : "当前保修未激活、已到期或额度用尽，暂不能提交新申请。"}</p>
            <form onSubmit={submitClaim}>
              <select id="problem-type" aria-label="Problem type" value={problemType} onChange={(event) => setProblemType(event.target.value)}>
                {problemTypes.map((item, index) => <option key={item} value={index}>{item}</option>)}
              </select>
              <button className="secondary-button" disabled={busy} type="submit">Submit claim</button>
            </form>
            {localFeedback("claim")}
            {activeClaim && <div className="inline-help">Pending claim #{activeClaim.id.toString()} is waiting for a service center.</div>}
          </article>

          <article className={`tool-card ${product && nextStep.target === "service" ? "guide-target" : ""}`}>
            <span className="tool-number">D</span>
            <h3>Process a claim</h3>
            <p>Service centers approve, reject, or complete approved work.</p>
            <p className="card-guide" lang="zh-CN">{selectedClaim?.status === 3n ? "此申请已批准：实际服务完成后，选择下方结果并点 Complete，不用再次 Approve。" : selectedClaim?.status === 1n ? "此申请待处理：服务中心点 Approve 或 Reject。批准后还需要登记实际服务结果。" : selectedClaim ? "此编号已经结束处理；如需处理其他申请，请换成对应编号。" : "填写下方历史中的 Claim ID，或使用引导按钮自动填入。先审批，实际服务完成后再点 Complete。"}</p>
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
                <div className="claim-summary"><span className="claim-id">#{claim.id.toString()}</span><strong>{claimStatuses[Number(claim.status)]}</strong><span>{problemTypes[Number(claim.problemType)]}</span><span>{formatDate(claim.submittedAt)}</span><span>{claim.serviceResult ? serviceResults[Number(claim.serviceResult)] : "—"}</span></div>
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
      {feedback && toastVisible && <aside className="feedback-toast" aria-label="操作通知">
        <ActionFeedback feedback={feedback} announce={false} />
        {feedback.kind !== "pending" && <button className="feedback-close" type="button" aria-label="关闭通知" onClick={() => setToastVisible(false)}>×</button>}
      </aside>}
    </main>
  );
}

export default App;
