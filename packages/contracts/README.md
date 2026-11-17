# Contracts

This package contains the Solidity contract, Hardhat configuration, deployment script, and acceptance tests for AC01–AC09 and the contract portion of AC13.

```sh
npm install
npm run compile
npm run test:acceptance
```

For the local demo, start the chain in one terminal and deploy in another:

```sh
npm run node
npm run deploy
```

The deploy script initializes the first Hardhat accounts as administrator, manufacturer, retailer, and service center, then registers `DEMO-001 / SN-DEMO-001`.
