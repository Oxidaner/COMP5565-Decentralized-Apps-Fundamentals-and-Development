import { Interface } from "ethers";
import { targetNetwork } from "./network";
import type { Feedback } from "./ActionFeedback";

const contractErrors: Record<string, string> = {
  NotAdmin: "只有管理员可以授权或撤销角色。请切换到部署合约的账户，在钱包中连接当前网站后重新连接网页钱包。",
  NotManufacturer: "当前账户不是已授权制造商，不能登记产品。请切换制造商账户，或请管理员先授权。",
  NotServiceCenter: "当前账户没有处理这笔理赔的权限。请连接已授权服务中心；已撤销的中心只能完成自己此前批准的维修。",
  Unauthorized: "当前账户没有操作权限。请核对本步所需角色并重新连接钱包。",
  EmptyValue: "必填信息不能为空，请填写产品编号、序列号和型号。",
  InvalidAddress: "钱包地址无效：请填写完整非零地址，接收方不能是当前所有者。",
  InvalidWarranty: "保修期限和理赔上限必须大于零，请检查登记信息。",
  AlreadyRegistered: "产品编号或序列号已经登记过。请换一组未使用的编号；如需查看原产品，请点 Verify product。",
  ProductNotFound: "未找到这组产品编号和序列号。请核对输入及合约地址，或先由制造商登记产品。",
  NotCurrentOwner: "只有当前所有者可以执行此操作。请使用产品详情中的 Current owner 账户，连接网站后重新连接网页钱包。",
  InvalidRolePath: "接收账户角色不符合转让规则：制造商只能转给已授权零售商，零售商和消费者只能转给没有机构角色的消费者。",
  TransferAlreadyPending: "已经有一笔待接收转让。请先接收、拒绝或取消；已超时的转让可点 Expire 清理。",
  TransferNotFound: "当前没有待处理转让，可能已被其他账户处理。请点 Verify product 刷新后再操作。",
  TransferExpired: "这笔转让已经超时，无法接收。请先点 Expire 清理，再由当前所有者重新发起。",
  NotTransferRecipient: "只有指定接收方可以接收或拒绝转让。请切换到 Pending recipient 对应账户，连接网站后再试。",
  InvalidEnumValue: "问题类型或服务结果无效，请重新选择。",
  InvalidTimeout: "转让超时时间必须大于零。",
  ClaimAlreadyPending: "该产品已有待处理理赔，不能重复提交。请等待服务中心处理后再申请。",
  ClaimNotFound: "未找到这个 Claim ID。请查看当前产品的 Claim history，填写正确编号。",
  InvalidClaimStatus: "这笔理赔的状态不支持当前操作。只能批准或拒绝 Pending 申请，只有 Approved 申请可以点 Complete；已结束的申请不能重复处理。",
  WarrantyUnavailable: "当前无法使用新的保修额度：保修可能尚未激活、已经到期，或获批次数已达上限。请查看产品详情；已经 Approved 的理赔仍可完成维修。",
  ClaimOwnerChanged: "产品所有者已变更，这笔旧申请不能继续审批。请刷新产品，由新所有者按当前保修情况重新申请。"
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
      if (name === "TransferExpired" && action === "expire") return "转让还没有超时，暂不能点 Expire。请等待截止时间，或由原所有者点 Cancel、接收方点 Reject。";
      return contractErrors[name];
    }
  }
  const codes = candidates.map((candidate) => candidate.code);
  if (codes.includes("ACTION_REJECTED") || codes.includes(4001)) return "你已取消钱包请求，操作未完成。如需继续，请再次点击对应按钮并在钱包中确认。";
  if (codes.includes(-32002)) return "钱包中已有一个待处理请求。请打开钱包完成或取消该请求，再返回页面操作。";
  if (codes.includes("INSUFFICIENT_FUNDS")) return `当前账户没有足够的 ${targetNetwork.chainId === 11155111 ? "SepoliaETH" : "本地测试 ETH"} 支付网络费用，请补充目标网络的测试币后再试。`;
  if (codes.some((code) => ["NETWORK_ERROR", "SERVER_ERROR", "TIMEOUT"].includes(String(code)))) return `无法连接 ${targetNetwork.name}。请检查 RPC 和网络；本地测试请确认 Hardhat 节点仍在运行。`;
  if (codes.includes("CALL_EXCEPTION")) return "合约拒绝了这次操作。请点 Verify product 刷新，核对账户权限、产品和理赔状态后再试。";
  const message = String(outer.shortMessage || outer.message || "");
  if (/user (rejected|denied)/i.test(message)) return "你已取消钱包请求，操作未完成。如需继续，请再次点击对应按钮并在钱包中确认。";
  if (/fetch|failed to fetch|ECONNREFUSED/i.test(message)) return `无法读取 ${targetNetwork.name}，请检查 RPC；本地测试请确认 Hardhat 节点已启动。`;
  if (/Switch your wallet/i.test(message)) return `钱包网络不匹配。请切换到 ${targetNetwork.name}（Chain ID ${targetNetwork.chainId}），再点 Connect wallet。`;
  if (/install or enable a browser wallet/i.test(message)) return "没有检测到浏览器钱包。请安装或启用 MetaMask 等钱包，再点 Connect wallet。";
  if (/configure a contract/i.test(message)) return "请先在 Network setup 填入已部署合约的地址和区块，再点 Connect contract。";
  if (/valid non-zero contract address/i.test(message)) return "合约地址无效。请填写部署时得到的完整非零 Contract 地址，不要填钱包地址。";
  if (/deployment block.*non-negative whole number/i.test(message)) return "Deployment block 必须是大于或等于零的整数，请核对部署输出。";
  if (/Sepolia requires the actual deployment block/i.test(message)) return "Sepolia 的 Deployment block 需要填写实际部署区块，不能填零。";
  return message ? `操作未完成：${message.split("\n")[0].slice(0, 220)}` : "操作未完成，未能读取具体原因。请核对网络和钱包，刷新产品后再试。";
}

export function transactionFailure(error: unknown, submitted: boolean, hash?: string, action?: string): Feedback {
  if (submitted && !(error instanceof InputError) && record(record(error).receipt).status !== 0) {
    return { kind: "warning", message: "交易已提交，但未能确认最终结果。请查看钱包活动记录，再点 Verify product，避免重复发送。部署交易请核对钱包中的合约地址。", hash };
  }
  return { kind: "error", message: errorMessage(error, action), hash };
}
