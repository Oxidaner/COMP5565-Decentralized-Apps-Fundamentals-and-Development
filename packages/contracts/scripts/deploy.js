const hre = require("hardhat");

async function main() {
  const [admin, manufacturer, retailer, serviceCenter] = await hre.ethers.getSigners();
  const Factory = await hre.ethers.getContractFactory("ProductWarranty");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  await (await contract.addManufacturer(manufacturer.address)).wait();
  await (await contract.addRetailer(retailer.address)).wait();
  await (await contract.addServiceCenter(serviceCenter.address)).wait();

  const warrantySeconds = 24 * 30 * 24 * 60 * 60;
  await (
    await contract
      .connect(manufacturer)
      .registerProduct("DEMO-001", "SN-DEMO-001", "Demo Phone", warrantySeconds, 3)
  ).wait();

  console.log(`Contract: ${await contract.getAddress()}`);
  console.log(`Admin: ${admin.address}`);
  console.log(`Manufacturer: ${manufacturer.address}`);
  console.log(`Retailer: ${retailer.address}`);
  console.log(`Service center: ${serviceCenter.address}`);
  console.log("Demo product: DEMO-001 / SN-DEMO-001");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
