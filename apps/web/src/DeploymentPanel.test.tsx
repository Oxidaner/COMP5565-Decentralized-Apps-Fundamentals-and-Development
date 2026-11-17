import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeploymentPanel from "./DeploymentPanel";

const mocks = vi.hoisted(() => ({ getWalletSigner: vi.fn(), getWalletContract: vi.fn(), getReadContract: vi.fn(), deploy: vi.fn() }));
vi.mock("./contract", () => mocks);
vi.mock("ethers", async (original) => ({
  ...await original<typeof import("ethers")>(),
  ContractFactory: class { deploy = mocks.deploy; }
}));

const address = "0x1111111111111111111111111111111111111111";
const otherWallet = "0x2222222222222222222222222222222222222222";
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("wallet deployment setup", () => {
  it("shows an honest disconnected state", () => {
    render(<DeploymentPanel connection={{ address: "", fromBlock: 0 }} onChange={vi.fn()} disabled={false} />);
    expect(screen.getByText(/No contract connected yet/)).toBeInTheDocument();
  });

  it("validates an existing contract before activating and sharing it", async () => {
    const onChange = vi.fn();
    mocks.getReadContract.mockReturnValue({ admin: vi.fn(async () => address), runner: { provider: { getCode: async () => "0x1234", getBlockNumber: async () => 1000 } } });
    render(<DeploymentPanel connection={{ address: "", fromBlock: 0 }} onChange={onChange} disabled={false} />);
    fireEvent.change(screen.getByLabelText("Contract address"), { target: { value: address } });
    fireEvent.change(screen.getByLabelText("Deployment block"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect contract" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ address, fromBlock: 123 }));
    expect(window.location.hash).toContain(`contract=${address}`);
  });

  it("explains when a wallet address was entered instead of a deployed contract", async () => {
    const onChange = vi.fn();
    const admin = vi.fn();
    mocks.getReadContract.mockReturnValue({ admin, runner: { provider: { getCode: async () => "0x" } } });
    render(<DeploymentPanel connection={{ address: "", fromBlock: 0 }} onChange={onChange} disabled={false} />);
    fireEvent.change(screen.getByLabelText("Contract address"), { target: { value: otherWallet } });
    fireEvent.click(screen.getByRole("button", { name: "Connect contract" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("没有合约代码"));
    expect(admin).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("waits for a wallet deployment receipt and records its actual block", async () => {
    const onChange = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ abi: [], bytecode: "0x1234" }) })));
    mocks.getWalletSigner.mockResolvedValue({});
    mocks.deploy.mockResolvedValue({ getAddress: async () => address, deploymentTransaction: () => ({ hash: "0xabc", wait: async () => ({ blockNumber: 123, status: 1 }) }) });
    render(<DeploymentPanel connection={{ address: "", fromBlock: 0 }} onChange={onChange} disabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Deploy new contract with wallet" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ address, fromBlock: 123 }));
    expect(screen.getByRole("status")).toHaveTextContent("合约部署成功");
  });

  it("does not claim a deployment succeeded when the wallet rejects it", async () => {
    const onChange = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ abi: [], bytecode: "0x1234" }) })));
    mocks.getWalletSigner.mockRejectedValue(new Error("User rejected deployment"));
    render(<DeploymentPanel connection={{ address: "", fromBlock: 0 }} onChange={onChange} disabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Deploy new contract with wallet" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("已取消钱包请求"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("lets the administrator grant a manufacturer role using the wallet", async () => {
    const addManufacturer = vi.fn(async () => ({ hash: "0xdef", wait: vi.fn(async () => ({ status: 1 })) }));
    mocks.getWalletContract.mockResolvedValue({ contract: { admin: async () => address, isManufacturer: async () => false, addManufacturer }, address });
    render(<DeploymentPanel connection={{ address, fromBlock: 123 }} onChange={vi.fn()} disabled={false} />);
    fireEvent.change(screen.getByLabelText("Team wallet"), { target: { value: address } });
    fireEvent.click(screen.getByRole("button", { name: "Grant role" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Manufacturer 角色授权成功"));
    expect(addManufacturer).toHaveBeenCalledWith(address);
  });

  it.each(["Grant role", "Revoke role"])("explains the administrator mismatch before %s sends a transaction", async (button) => {
    const addManufacturer = vi.fn();
    const removeManufacturer = vi.fn();
    mocks.getWalletContract.mockResolvedValue({ contract: { admin: async () => address, addManufacturer, removeManufacturer }, address: otherWallet });
    render(<DeploymentPanel connection={{ address, fromBlock: 123 }} onChange={vi.fn()} disabled={false} />);
    fireEvent.change(screen.getByLabelText("Team wallet"), { target: { value: otherWallet } });
    fireEvent.click(screen.getByRole("button", { name: button }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(`只有管理员可以修改角色`));
    expect(screen.getByRole("alert")).toHaveTextContent(address);
    expect(screen.getByRole("alert")).toHaveTextContent(otherWallet);
    expect(addManufacturer).not.toHaveBeenCalled();
    expect(removeManufacturer).not.toHaveBeenCalled();
  });

  it("prevents a duplicate role grant and explains why", async () => {
    const addManufacturer = vi.fn();
    mocks.getWalletContract.mockResolvedValue({ contract: { admin: async () => address, isManufacturer: async () => true, addManufacturer }, address });
    render(<DeploymentPanel connection={{ address, fromBlock: 123 }} onChange={vi.fn()} disabled={false} />);
    fireEvent.change(screen.getByLabelText("Team wallet"), { target: { value: otherWallet } });
    fireEvent.click(screen.getByRole("button", { name: "Grant role" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("无需重复授权"));
    expect(addManufacturer).not.toHaveBeenCalled();
  });

  it("gives feedback for an empty contract address instead of only native form validation", async () => {
    render(<DeploymentPanel connection={{ address: "", fromBlock: 0 }} onChange={vi.fn()} disabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect contract" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("合约地址无效"));
  });
});
