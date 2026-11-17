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
    notify({ kind: "pending", message: "Checking the contract address and deployment block…" });
    try {
      const value = validateConnection(address, fromBlock);
      const contract = getReadContract(value)!;
      const provider = contract.runner!.provider!;
      if (await provider.getCode(value.address) === "0x") {
        throw new InputError("This address has no contract code on the target network. Use the Contract address from the deployment output, not a wallet address; redeploy after restarting a local chain.");
      }
      await contract.admin();
      const latest = await provider.getBlockNumber();
      if (value.fromBlock > latest) throw new InputError("The deployment block is ahead of the latest block on this chain. Check the deployment output.");
      activate(value);
      notify({ kind: "success", message: "Contract connected. You can verify products now, or share the Team link below with your team." });
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
      notify({ kind: "pending", message: "Loading the contract. Check the network in your wallet and confirm the deployment." });
      const response = await fetch(`${import.meta.env.BASE_URL}ProductWarranty.json`);
      if (!response.ok) throw new Error("Deployment artifact unavailable. Rebuild the site from the contract source.");
      const artifact = await response.json();
      const signer = await getWalletSigner();
      const contract = await new ContractFactory(artifact.abi, artifact.bytecode, signer).deploy();
      const transaction = contract.deploymentTransaction()!;
      submitted = true;
      hash = transaction.hash;
      notify({ kind: "pending", message: "Deployment submitted. Waiting for confirmation; do not deploy again.", hash });
      const receipt = await transaction.wait();
      if (!receipt) {
        notify({ kind: "warning", message: "Deployment submitted, but the result is not confirmed yet. Check your wallet activity; do not deploy again.", hash });
        return;
      }
      if (receipt.status !== 1) throw new InputError("Contract deployment failed. Check the transaction in your wallet and the network.");
      activate({ address: await contract.getAddress(), fromBlock: receipt.blockNumber });
      notify({ kind: "success", message: "Contract deployed and connected. This wallet is the administrator and can grant organization roles below.", hash });
    } catch (error) {
      notify(transactionFailure(error, submitted, hash));
    } finally {
      setBusy(false);
    }
  }

  async function updateRole(active: boolean) {
    setBusy(true);
    notify({ kind: "pending", message: "Checking the administrator account and the team member's roles…" });
    let submitted = false;
    let hash: string | undefined;
    try {
      if (!isAddress(account.trim()) || getAddress(account.trim()) === ZeroAddress) {
        throw new InputError("Enter the team member's complete, valid, non-zero wallet address.");
      }
      const { contract, address: walletAddress } = await getWalletContract(connection);
      const admin = String(await contract.admin());
      if (walletAddress.toLowerCase() !== admin.toLowerCase()) {
        throw new InputError(`Only the administrator can change roles. Switch your wallet to ${admin}, connect it to this site, then click Connect wallet. Current signer: ${walletAddress}.`);
      }
      if (Boolean(await contract[`is${role}`](account.trim())) === active) {
        throw new InputError(active ? `This account already has the ${role} role; no need to grant it again.` : `This account does not have the ${role} role; nothing to revoke.`);
      }
      notify({ kind: "pending", message: "Confirm the administrator role transaction in your wallet." });
      const transaction = await contract[`${active ? "add" : "remove"}${role}`](account.trim());
      submitted = true;
      hash = transaction.hash;
      notify({ kind: "pending", message: "Role transaction submitted. Waiting for confirmation; do not repeat it.", hash });
      const receipt = await transaction.wait();
      if (!receipt) {
        notify({ kind: "warning", message: "Role transaction submitted, but the result is not confirmed yet. Check your wallet and recheck the role; do not send it again.", hash });
        return;
      }
      if (receipt.status !== 1) throw new InputError("Role transaction failed. Check your wallet activity and administrator permissions.");
      notify({ kind: "success", message: `${role} role ${active ? "granted" : "revoked"}: ${account.trim()}.`, hash });
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
          <p className="setup-guide">{targetNetwork.chainId === 31337 ? "Started with the local deploy script? Enter the Contract address printed in the terminal, set Deployment block to 0, and click Connect contract. The script already set up the demo roles, so there is no need to redeploy or grant roles again." : "To join an existing team, open the Team link shared by the administrator to use the same contract. Only the first team setup needs Deploy new contract with wallet, which spends Sepolia test ETH."}</p>
          <p>The deploying wallet becomes the only administrator. {targetNetwork.chainId === 11155111 ? "Deployment needs Sepolia test ETH; never use mainnet funds or public Hardhat account keys." : "Use only local test accounts."}</p>
          <button type="button" className="small-button" onClick={deploy}>Deploy new contract with wallet</button>
          {connection.address && <label className="share-link">Team link<input readOnly value={connectionLink(connection)} onFocus={(event) => event.target.select()} /></label>}
          {connection.address && <div className="role-setup">
            <h3>Administrator: team roles</h3>
            <p>Only the deploying wallet can grant or revoke roles. Consumers do not need a role.</p>
            <p className="setup-guide">Use this only to add organization members: switch to the administrator account that deployed the contract and connect it to this site, enter the Team wallet, choose a Role, then click Grant role. Customers need no role. Do not change the Contract address when switching business accounts.</p>
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
