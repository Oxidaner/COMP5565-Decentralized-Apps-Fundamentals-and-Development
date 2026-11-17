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
    target: "setup", title: "先连接大家共用的合约",
    detail: "在 Network setup 填入部署时得到的 Contract address 和 Deployment block，再点 Connect contract。这里不是钱包地址；已有合约就不用重新部署。",
    action: "去连接合约", focus: "contract-address"
  };
  if (!product) return {
    target: "verify", title: "先找到你要操作的产品",
    detail: "填写 Product ID 和 Serial number，再点 Verify product。查询不用连接钱包；如果还没登记产品，可以先到 Register product。",
    action: "去填写产品信息", focus: "product-id"
  };
  if (transfer) {
    if (now > Number(transfer.deadline)) return {
      target: "transfer", title: "这笔转让已超时，先清理再重新发起",
      detail: "到 Transfer ownership 点 Expire，在钱包确认。清理不会改变所有者；完成后由当前所有者重新 Start transfer。",
      action: "去清理超时转让", focus: "expire-transfer", wallet: "任意账户都可以清理"
    };
    return {
      target: "transfer", title: "交给接收方，完成第二步",
      detail: "切换到下方接收账户并连接网站，再到 Transfer ownership 点 Accept，在钱包确认。只点 Start transfer 还没有改变所有者。原所有者也可以点 Cancel 取消。",
      action: "去接收转让", focus: "accept-transfer", account: transfer.to, wallet: "指定接收方"
    };
  }
  const approved = claims.find((claim) => claim.status === 3n);
  if (approved) return {
    target: "service", title: `理赔 #${approved.id} 已批准，接下来登记维修结果`,
    detail: "批准不等于修好。实际服务完成后，在 Process a claim 选择 Service result，再点 Complete 并确认交易。即使保修已过期或次数用尽，这笔已批准理赔仍可完成。",
    action: `去完成理赔 #${approved.id}`, focus: "service-result", claimId: approved.id.toString(),
    wallet: "已授权服务中心，或此前批准此申请的服务中心"
  };
  const pending = claims.find((claim) => claim.status === 1n);
  if (pending) return {
    target: "service", title: `理赔 #${pending.id} 等待服务中心处理`,
    detail: warranty === "Active"
      ? "切换到已授权服务中心。到 Process a claim 核对 Claim ID，再点 Approve 或 Reject 并在钱包确认。批准才消耗次数；拒绝后可以重新申请。"
      : "这笔申请仍待处理，但当前保修已过期或额度已用尽，不能再批准。已授权服务中心可在 Process a claim 核对 Claim ID 后点 Reject。",
    action: `去处理理赔 #${pending.id}`, focus: "claim-id", claimId: pending.id.toString(), wallet: "已授权服务中心"
  };
  if (product.stage < 2n) return {
    target: "transfer", title: product.stage === 0n ? "由制造商发起第一次转让" : "由零售商销售给消费者",
    detail: product.stage === 0n
      ? "使用当前所有者账户，在 Transfer ownership 填入已授权零售商的完整钱包地址，点 Start transfer 并确认。之后需要零售商换自己的账户点 Accept。"
      : "使用当前所有者账户，填入未登记机构角色的消费者钱包地址，点 Start transfer 并确认。消费者用自己的账户 Accept 后才激活保修。",
    action: "去填写接收地址", focus: "transfer-recipient", account: product.currentOwner, wallet: "当前所有者"
  };
  if (warranty !== "Active") return {
    target: "transfer", title: warranty === "Expired" ? "保修已到期，所有权仍可转让" : "理赔次数已用尽，仍可查看记录或转售",
    detail: "不能提交新的理赔。历史记录会保留；如需转售，当前所有者可填写新消费者地址并点 Start transfer，接收方再点 Accept。",
    action: "查看转售操作", focus: "transfer-recipient", account: product.currentOwner, wallet: "转售时使用当前所有者"
  };
  const serviced = claims.some((claim) => claim.status === 4n);
  return {
    target: "claim", title: serviced ? "本次售后已完成，记录会跟随产品保留" : "产品已归消费者，保修可以使用了",
    detail: serviced
      ? "不需要再点 Complete。只有出现新的问题时，当前所有者才需选择 Problem type 并点 Submit claim；如需转售，可直接使用 Transfer ownership。"
      : "如需保修，当前所有者在 Submit a claim 选择 Problem type，再点 Submit claim 并确认。没有故障就不用申请；也可以到 Transfer ownership 转售。",
    action: "查看保修操作", focus: "problem-type", account: product.currentOwner, wallet: "申请或转售时使用当前所有者"
  };
}

export default function NextStep({ step, walletAddress, busy, phase, onNavigate }: {
  step: GuideStep; walletAddress: string; busy: boolean;
  phase: "signature" | "confirmation" | null; onNavigate: (step: GuideStep) => void;
}) {
  const walletMatches = !!step.account && step.account.toLowerCase() === walletAddress.toLowerCase();
  return (
    <aside className="next-step" lang="zh-CN" aria-label="操作引导" aria-busy={busy}>
      <div className="next-step-copy" aria-live="polite" aria-atomic="true">
        <span className="guide-kicker">{busy ? "正在进行" : "接下来"}</span>
        <h3>{busy ? phase === "signature" ? "请在钱包中确认这笔交易" : phase === "confirmation" ? "交易已提交，等待链上确认" : "正在读取链上记录" : step.title}</h3>
        <p>{busy ? phase ? "确认前核对钱包账户和网络；交易处理中不用重复点击，完成后这里会提示下一步。" : "读取完成后会显示适合当前产品的下一步操作。" : step.detail}</p>
        {!busy && step.wallet && <div className="guide-account">
          <span>{step.wallet}{step.account && walletMatches ? " · 当前网页账户一致" : ""}</span>
          {step.account && <code>{step.account}</code>}
          {!step.account || !walletMatches ? <small>{walletAddress ? `网页当前连接 ${shortAddress(walletAddress)}。` : "尚未连接网页钱包。"}在 MetaMask 中选好本步账户，确认该账户已连接当前网站，再点页面右上角 Connect wallet；核对钱包与网页显示的地址。切换账户不需要改合约地址。</small> : null}
        </div>}
      </div>
      {!busy && <div className="guide-actions">
        <button className="guide-button" type="button" onClick={() => onNavigate(step)}>{step.action}<span aria-hidden="true"> ↗</span></button>
        {step.target === "verify" && <button className="guide-link" type="button" onClick={() => onNavigate({ target: "register", title: "", detail: "", action: "", focus: "registration-product-id" })}>还没有产品？去登记</button>}
      </div>}
    </aside>
  );
}
