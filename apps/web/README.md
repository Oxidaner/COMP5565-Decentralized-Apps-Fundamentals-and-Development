# Web

The React/Vite front end has two paths:

- Public verification reads the local contract and does not require a wallet.
- The role workbench connects a browser wallet for registration, ownership transfer, claim submission, approval, rejection, and service completion.

After deploying the contract, create `apps/web/.env.local`:

```sh
VITE_CONTRACT_ADDRESS=0x...
VITE_RPC_URL=http://127.0.0.1:8545
```

Use the address printed as `Contract` by the deployment script. Restart Vite after changing these values. The local chain has chain ID `31337` (`0x7a69`); writes are blocked on other networks before requesting accounts. Add this network in your browser wallet with the RPC URL above and currency symbol `ETH`.

Import the local test accounts printed by `hardhat node`: account 1 is the manufacturer, 2 the retailer, 3 the service center, and 4/5 can be the first/resale customers. Account 0 is the administrator. These public test keys must never hold real funds.

Run the checks and development server:

```sh
npm install
npm run lint
npm run test:acceptance
npm run build
npm run dev
```

## Demo walkthrough

1. Query `DEMO-001 / SN-DEMO-001` without connecting a wallet. Registration is evidence of an authorized on-chain record, not proof that a physical device is genuine.
2. Connect account 1, enter account 2's address, and start the transfer. Switch to account 2, reconnect, and accept it. Warranty is not active yet.
3. As account 2, start a transfer to account 4. Switch to account 4, reconnect, and accept. The warranty start, end, duration, and quota appear in the product details.
4. As account 4, select a problem type and submit a claim. Copy the claim ID from the history.
5. As account 3, reconnect, enter the claim ID, and approve. The approved count increases, but the claim is not serviced yet. Select a service result and complete it. The history shows the actors and timestamps.
6. As account 4, start a transfer to account 5; reconnect as account 5 and accept. The warranty dates and already approved claims follow the product. A pending claim would instead be cancelled on acceptance.

All workbench actions target the loaded product, not an unsubmitted change in the search fields. Inputs have accessible names, and pending transactions disable further writes. A confirmed transaction with a failed read refresh is reported as confirmed; query again rather than sending it twice.

Acceptance tests exercise rendered flows with mocked contract calls and test the real ethers `BrowserProvider` against a test EIP-1193 provider. They do not replace a browser-extension wallet walkthrough. `test:acceptance` discovers all Vitest test files so CI also runs the flow, formatting, and wallet tests.
