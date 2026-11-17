import { FormEvent, useState } from "react";
import { ContractFactory, getAddress, isAddress, ZeroAddress } from "ethers";
import { getReadContract, getWalletContract, getWalletSigner } from "./contract";
import { Connection, connectionLink, saveConnection, targetNetwork, validateConnection } from "./network";

function message(error: unknown): string {
  return error instanceof Error ? error.message.split("\n")[0] : "Request failed. Check the wallet and RPC connection.";
}

export default function DeploymentPanel({ connection, onChange, disabled }: {
  connection: Connection;
  onChange: (value: Connection) => void;
  disabled: boolean;
}) {
  const [address, setAddress] = useState(connection.address);
  const [fromBlock, setFromBlock] = useState(String(connection.fromBlock));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("Manufacturer");
  const [account, setAccount] = useState("");

  function activate(value: Connection) {
    saveConnection(value);
    setAddress(value.address);
    setFromBlock(String(value.fromBlock));
    onChange(value);
  }

  async function configure(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const value = validateConnection(address, fromBlock);
      const contract = getReadContract(value)!;
      await contract.admin();
      const latest = await contract.runner!.provider!.getBlockNumber();
      if (value.fromBlock > latest) throw new Error("Deployment block is ahead of the current chain.");
      activate(value);
      setStatus("Contract connected. Share the link below with your team.");
    } catch (error) {
      setStatus(message(error));
    } finally {
      setBusy(false);
    }
  }

  async function deploy() {
    setBusy(true);
    try {
      setStatus("Loading compiled contract. Your wallet will ask you to confirm deployment.");
      const response = await fetch(`${import.meta.env.BASE_URL}ProductWarranty.json`);
      if (!response.ok) throw new Error("Deployment artifact unavailable. Rebuild the site from the contract source.");
      const artifact = await response.json();
      const signer = await getWalletSigner();
      const contract = await new ContractFactory(artifact.abi, artifact.bytecode, signer).deploy();
      const transaction = contract.deploymentTransaction()!;
      setStatus(`Deployment submitted: ${transaction.hash}. Waiting for confirmation; do not deploy twice.`);
      const receipt = await transaction.wait();
      if (!receipt) throw new Error("Deployment has not been confirmed yet.");
      activate({ address: await contract.getAddress(), fromBlock: receipt.blockNumber });
      setStatus("Contract deployed. This wallet is the administrator. Assign the team roles below, then share the link.");
    } catch (error) {
      setStatus(message(error));
    } finally {
      setBusy(false);
    }
  }

  async function updateRole(active: boolean) {
    setBusy(true);
    try {
      if (!isAddress(account.trim()) || getAddress(account.trim()) === ZeroAddress) {
        throw new Error("Enter a valid non-zero team wallet address.");
      }
      const { contract } = await getWalletContract(connection);
      setStatus("Confirm the administrator role transaction in your wallet.");
      const transaction = await contract[`${active ? "add" : "remove"}${role}`](account.trim());
      setStatus(`Role transaction submitted: ${transaction.hash}. Waiting for confirmation.`);
      await transaction.wait();
      setStatus(`${role} ${active ? "granted to" : "revoked from"} ${account.trim()}.`);
    } catch (error) {
      setStatus(message(error));
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
          <form onSubmit={configure} className="network-form">
            <label>Contract address<input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="0x..." required /></label>
            <label>Deployment block<input value={fromBlock} onChange={(event) => setFromBlock(event.target.value)} inputMode="numeric" required /></label>
            <button type="submit" className="secondary-button">Connect contract</button>
          </form>
          <p>The deploying wallet becomes the only administrator. {targetNetwork.chainId === 11155111 ? "Deployment needs Sepolia test ETH; never use mainnet funds or public Hardhat account keys." : "Use only local test accounts."}</p>
          <button type="button" className="small-button" onClick={deploy}>Deploy new contract with wallet</button>
          {connection.address && <label className="share-link">Team link<input readOnly value={connectionLink(connection)} onFocus={(event) => event.target.select()} /></label>}
          {connection.address && <div className="role-setup">
            <h3>Administrator: team roles</h3>
            <p>Only the deploying wallet can grant or revoke roles. Consumers do not need a role.</p>
            <label>Team wallet<input value={account} onChange={(event) => setAccount(event.target.value)} placeholder="Team member address" /></label>
            <label>Role<select value={role} onChange={(event) => setRole(event.target.value)}><option>Manufacturer</option><option>Retailer</option><option>ServiceCenter</option></select></label>
            <div className="button-row"><button type="button" className="small-button" onClick={() => updateRole(true)}>Grant role</button><button type="button" className="small-button muted-button" onClick={() => updateRole(false)}>Revoke role</button></div>
          </div>}
        </fieldset>
      </details>
      <p className="status-line" role="status" aria-label="Network setup status">{status}</p>
    </section>
  );
}
