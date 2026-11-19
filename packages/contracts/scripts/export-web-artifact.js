const { readFileSync, mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const artifact = JSON.parse(readFileSync(path.join(__dirname, "../artifacts/contracts/ProductWarranty.sol/ProductWarranty.json"), "utf8"));
const output = path.join(__dirname, "../../../apps/web/public");
mkdirSync(output, { recursive: true });
writeFileSync(path.join(output, "ProductWarranty.json"), JSON.stringify({ abi: artifact.abi, bytecode: artifact.bytecode }));
console.log("Exported compiled contract for browser-wallet deployment.");
