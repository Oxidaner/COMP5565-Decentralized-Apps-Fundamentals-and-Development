# Web

The React/Vite front end has two paths:

- Public verification reads the local contract and does not require a wallet.
- The role workbench connects a browser wallet for registration, ownership transfer, claim submission, approval, rejection, and service completion.

After deploying the contract, create `apps/web/.env.local`:

```sh
VITE_CONTRACT_ADDRESS=0x...
VITE_RPC_URL=http://127.0.0.1:8545
```

Run the checks and development server:

```sh
npm install
npm run lint
npm run test:acceptance
npm run build
npm run dev
```
