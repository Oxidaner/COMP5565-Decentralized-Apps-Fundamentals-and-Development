import { FormEvent, useState } from "react";
import { ContractFactory, getAddress, isAddress, ZeroAddress } from "ethers";
import { getReadContract, getWalletContract, getWalletSigner } from "./contract";
import { Connection, connectionLink, saveConnection, targetNetwork, validateConnection } from "./network";
import ActionFeedback, { Feedback } from "./ActionFeedback";
import { errorMessage, InputError, transactionFailure } from "./errors";

export default function DeploymentPanel({ connection, onChange, disabled, onFeedback }: {
  connection: Connection;
  onChange: (value: Connection) => void;
  disabled: boolean;
  onFeedback?: (value: Feedback) => void;
}) {
  const [address, setAddress] = useState(connection.address);
  const [fromBlock, setFromBlock] = useState(String(connection.fromBlock));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [role, setRole] = useState("Manufacturer");
  const [account, setAccount] = useState("");

  function notify(value: Feedback) {
    setFeedback(value);
    onFeedback?.(value);
  }

  function activate(value: Connection) {
    saveConnection(value);
    setAddress(value.address);
    setFromBlock(String(value.fromBlock));
    onChange(value);
  }

  async function configure(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    notify({ kind: "pending", message: "正在核对合约地址和部署区块…" });
    try {
      const value = validateConnection(address, fromBlock);
      const contract = getReadContract(value)!;
      const provider = contract.runner!.provider!;
      if (await provider.getCode(value.address) === "0x") {
        throw new InputError("这个地址在目标网络上没有合约代码。请使用部署输出的 Contract 地址，不要填写钱包地址；本地链重启后需要重新部署。");
      }
      await contract.admin();
      const latest = await provider.getBlockNumber();
      if (value.fromBlock > latest) throw new InputError("部署区块超过了当前链的最新区块，请核对部署输出。");
      activate(value);
      notify({ kind: "success", message: "合约连接成功。可以查询产品，也可以将下方 Team link 分享给组员。" });
    } catch (error) {
      notify({ kind: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function deploy() {
    setBusy(true);
    let submitted = false;
    let hash: string | undefined;
    try {
      notify({ kind: "pending", message: "正在加载合约，请在钱包核对网络并确认部署。" });
      const response = await fetch(`${import.meta.env.BASE_URL}ProductWarranty.json`);
      if (!response.ok) throw new Error("Deployment artifact unavailable. Rebuild the site from the contract source.");
      const artifact = await response.json();
      const signer = await getWalletSigner();
      const contract = await new ContractFactory(artifact.abi, artifact.bytecode, signer).deploy();
      const transaction = contract.deploymentTransaction()!;
      submitted = true;
      hash = transaction.hash;
      notify({ kind: "pending", message: "部署交易已提交，正在等待确认，请勿重复部署。", hash });
      const receipt = await transaction.wait();
      if (!receipt) {
        notify({ kind: "warning", message: "部署交易已提交，尚未确认结果。请查看钱包活动记录，不要重复部署。", hash });
        return;
      }
      if (receipt.status !== 1) throw new InputError("合约部署执行失败，请在钱包查看交易记录并核对网络。");
      activate({ address: await contract.getAddress(), fromBlock: receipt.blockNumber });
      notify({ kind: "success", message: "合约部署成功，已连接这份合约。当前钱包为管理员，可在下方授权机构角色。", hash });
    } catch (error) {
      notify(transactionFailure(error, submitted, hash));
    } finally {
      setBusy(false);
    }
  }

  async function updateRole(active: boolean) {
    setBusy(true);
    notify({ kind: "pending", message: "正在核对管理员账户及组员角色…" });
    let submitted = false;
    let hash: string | undefined;
    try {
      if (!isAddress(account.trim()) || getAddress(account.trim()) === ZeroAddress) {
        throw new InputError("请填写组员完整、有效且非零的钱包地址。");
      }
      const { contract, address: walletAddress } = await getWalletContract(connection);
      const admin = String(await contract.admin());
      if (walletAddress.toLowerCase() !== admin.toLowerCase()) {
        throw new InputError(`只有管理员可以修改角色。请在钱包切换到 ${admin} 并连接当前网站，再点 Connect wallet。当前签名账户：${walletAddress}。`);
      }
      if (Boolean(await contract[`is${role}`](account.trim())) === active) {
        throw new InputError(active ? `该账户已经有 ${role} 角色，无需重复授权。` : `该账户没有 ${role} 角色，无需撤销。`);
      }
      notify({ kind: "pending", message: "请在钱包确认管理员角色交易。" });
      const transaction = await contract[`${active ? "add" : "remove"}${role}`](account.trim());
      submitted = true;
      hash = transaction.hash;
      notify({ kind: "pending", message: "角色交易已提交，正在等待确认，请勿重复操作。", hash });
      const receipt = await transaction.wait();
      if (!receipt) {
        notify({ kind: "warning", message: "角色交易已提交，但尚未确认结果。请查看钱包并重新核对角色，不要重复发送。", hash });
        return;
      }
      if (receipt.status !== 1) throw new InputError("角色交易执行失败，请检查钱包记录和管理员权限。");
      notify({ kind: "success", message: `${role} 角色${active ? "授权" : "撤销"}成功：${account.trim()}。`, hash });
    } catch (error) {
      notify(transactionFailure(error, submitted, hash));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="network-panel">
      <h2>Network setup</h2>
      <p><strong>{targetNetwork.name}</strong> · Chain ID {targetNetwork.chainId} · {connection.address ? "Contract configured" : "No contract connected yet"}</p>
      <p>RPC: <code>{targetNetwork.rpcUrl}</code></p>
      {!connection.address && <p>Deploy a contract with your wallet or enter an existing team contract. The website is online, but product records are unavailable until a contract is connected.</p>}
      <details open={!connection.address}>
        <summary>Connect or deploy the team contract</summary>
        <fieldset disabled={disabled || busy}>
          <form onSubmit={configure} className="network-form" noValidate>
            <label>Contract address<input id="contract-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="0x..." required /></label>
            <label>Deployment block<input value={fromBlock} onChange={(event) => setFromBlock(event.target.value)} inputMode="numeric" required /></label>
            <button type="submit" className="secondary-button">Connect contract</button>
          </form>
          <p>Contract address comes from deployment. Team wallet and recipient fields use account addresses.</p>
          <p className="setup-guide" lang="zh-CN">{targetNetwork.chainId === 31337 ? "用本地 deploy 脚本启动过？直接填终端输出的 Contract 地址，Deployment block 填 0，再点 Connect contract。脚本已配置演示角色，不用重新部署或重复授权。" : "加入现有团队时，打开管理员分享的 Team link 即可共用合约。只有首次建立团队环境才需要 Deploy new contract with wallet；部署使用 Sepolia 测试币。"}</p>
          <p>The deploying wallet becomes the only administrator. {targetNetwork.chainId === 11155111 ? "Deployment needs Sepolia test ETH; never use mainnet funds or public Hardhat account keys." : "Use only local test accounts."}</p>
          <button type="button" className="small-button" onClick={deploy}>Deploy new contract with wallet</button>
          {connection.address && <label className="share-link">Team link<input readOnly value={connectionLink(connection)} onFocus={(event) => event.target.select()} /></label>}
          {connection.address && <div className="role-setup">
            <h3>Administrator: team roles</h3>
            <p>Only the deploying wallet can grant or revoke roles. Consumers do not need a role.</p>
            <p className="setup-guide" lang="zh-CN">新增机构成员时才用这里：切换到部署合约的管理员账户，连接网站；填写 Team wallet，选择 Role，再点 Grant role。消费者无需授权。切换业务账户时不要修改 Contract address。</p>
            <label>Team wallet<input value={account} onChange={(event) => setAccount(event.target.value)} placeholder="Team member address" /></label>
            <label>Role<select value={role} onChange={(event) => setRole(event.target.value)}><option>Manufacturer</option><option>Retailer</option><option>ServiceCenter</option></select></label>
            <div className="button-row"><button type="button" className="small-button" onClick={() => updateRole(true)}>Grant role</button><button type="button" className="small-button muted-button" onClick={() => updateRole(false)}>Revoke role</button></div>
          </div>}
        </fieldset>
      </details>
      <ActionFeedback feedback={feedback} label="Network setup status" />
    </section>
  );
}
