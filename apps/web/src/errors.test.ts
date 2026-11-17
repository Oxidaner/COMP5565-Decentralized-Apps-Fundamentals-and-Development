import { Interface } from "ethers";
import { describe, expect, it } from "vitest";
import { CONTRACT_ABI } from "./contract";
import { errorMessage, transactionFailure } from "./errors";

const contract = new Interface(CONTRACT_ABI);

describe("readable contract and wallet errors", () => {
  it.each([
    ["NotManufacturer", "制造商"],
    ["NotCurrentOwner", "当前所有者"],
    ["NotTransferRecipient", "指定接收方"],
    ["InvalidRolePath", "转让规则"],
    ["AlreadyRegistered", "已经登记"],
    ["ProductNotFound", "未找到"],
    ["TransferAlreadyPending", "待接收转让"],
    ["ClaimNotFound", "Claim ID"],
    ["InvalidClaimStatus", "状态不支持"],
    ["WarrantyUnavailable", "保修额度"],
    ["ClaimAlreadyPending", "不能重复提交"]
  ])("decodes %s from ABI revert bytes", (name, text) => {
    expect(errorMessage({ code: "CALL_EXCEPTION", data: contract.encodeErrorResult(name) })).toContain(text);
  });

  it("decodes nested JSON-RPC revert data", () => {
    expect(errorMessage({ info: { error: { data: { data: contract.encodeErrorResult("NotServiceCenter") } } } })).toContain("服务中心");
  });

  it("explains that Expire cannot run before the deadline", () => {
    expect(errorMessage({ data: contract.encodeErrorResult("TransferExpired") }, "expire")).toContain("还没有超时");
  });

  it.each([
    ["ACTION_REJECTED", "取消钱包请求"],
    [4001, "取消钱包请求"],
    [-32002, "待处理请求"],
    ["INSUFFICIENT_FUNDS", "测试 ETH"],
    ["NETWORK_ERROR", "Hardhat"]
  ])("explains wallet/RPC error %s", (code, text) => {
    expect(errorMessage({ code })).toContain(text);
  });

  it("keeps a submitted transaction with an unknown outcome as a warning", () => {
    expect(transactionFailure({ code: "TIMEOUT" }, true, "0xabc")).toMatchObject({ kind: "warning", hash: "0xabc" });
    expect(transactionFailure({ code: "CALL_EXCEPTION", receipt: { status: 0 } }, true).kind).toBe("error");
  });
});
