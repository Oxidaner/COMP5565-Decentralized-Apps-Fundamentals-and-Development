import { Interface } from "ethers";
import { describe, expect, it } from "vitest";
import { CONTRACT_ABI } from "./contract";
import { errorMessage, transactionFailure } from "./errors";

const contract = new Interface(CONTRACT_ABI);

describe("readable contract and wallet errors", () => {
  it.each([
    ["NotManufacturer", "manufacturer"],
    ["NotCurrentOwner", "current owner"],
    ["NotTransferRecipient", "designated recipient"],
    ["InvalidRolePath", "transfer rules"],
    ["AlreadyRegistered", "already registered"],
    ["ProductNotFound", "No product matches"],
    ["TransferAlreadyPending", "already waiting for acceptance"],
    ["ClaimNotFound", "Claim ID"],
    ["InvalidClaimStatus", "status does not allow"],
    ["WarrantyUnavailable", "warranty coverage"],
    ["ClaimAlreadyPending", "another cannot be submitted"]
  ])("decodes %s from ABI revert bytes", (name, text) => {
    expect(errorMessage({ code: "CALL_EXCEPTION", data: contract.encodeErrorResult(name) })).toContain(text);
  });

  it("decodes nested JSON-RPC revert data", () => {
    expect(errorMessage({ info: { error: { data: { data: contract.encodeErrorResult("NotServiceCenter") } } } })).toContain("service center");
  });

  it("explains that Expire cannot run before the deadline", () => {
    expect(errorMessage({ data: contract.encodeErrorResult("TransferExpired") }, "expire")).toContain("has not expired yet");
  });

  it.each([
    ["ACTION_REJECTED", "cancelled the wallet request"],
    [4001, "cancelled the wallet request"],
    [-32002, "pending request"],
    ["INSUFFICIENT_FUNDS", "test ETH"],
    ["NETWORK_ERROR", "Hardhat"]
  ])("explains wallet/RPC error %s", (code, text) => {
    expect(errorMessage({ code })).toContain(text);
  });

  it("keeps a submitted transaction with an unknown outcome as a warning", () => {
    expect(transactionFailure({ code: "TIMEOUT" }, true, "0xabc")).toMatchObject({ kind: "warning", hash: "0xabc" });
    expect(transactionFailure({ code: "CALL_EXCEPTION", receipt: { status: 0 } }, true).kind).toBe("error");
  });
});
