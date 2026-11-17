const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const DAY = 24 * 60 * 60;
const MONTH = 30 * DAY;

async function deployFixture() {
  const [admin, manufacturer, retailer, customer, secondCustomer, serviceCenter, stranger] =
    await ethers.getSigners();
  const Factory = await ethers.getContractFactory("ProductWarranty");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  await (await contract.addManufacturer(manufacturer.address)).wait();
  await (await contract.addRetailer(retailer.address)).wait();
  await (await contract.addServiceCenter(serviceCenter.address)).wait();
  return {
    contract,
    admin,
    manufacturer,
    retailer,
    customer,
    secondCustomer,
    serviceCenter,
    stranger
  };
}

async function register(contract, manufacturer, productId = "P-001", serial = "S-001", maxClaims = 3) {
  await (
    await contract
      .connect(manufacturer)
      .registerProduct(productId, serial, "Demo Phone", 24 * MONTH, maxClaims)
  ).wait();
}

async function moveToCustomer(fixture, productId = "P-001", serial = "S-001") {
  const { contract, manufacturer, retailer, customer } = fixture;
  await (
    await contract
      .connect(manufacturer)
      .initiateTransfer(productId, serial, retailer.address)
  ).wait();
  await (
    await contract.connect(retailer).acceptTransfer(productId, serial)
  ).wait();
  await (
    await contract
      .connect(retailer)
      .initiateTransfer(productId, serial, customer.address)
  ).wait();
  await (
    await contract.connect(customer).acceptTransfer(productId, serial)
  ).wait();
}

describe("ProductWarranty acceptance", function () {
  it("AC01: restricts role operations to configured addresses", async function () {
    const fixture = await deployFixture();
    const { contract, manufacturer, stranger } = fixture;

    await expect(
      contract.connect(stranger).registerProduct("P-001", "S-001", "Phone", MONTH, 1)
    ).to.be.revertedWithCustomError(contract, "NotManufacturer");
    await expect(
      contract.connect(stranger).addRetailer(stranger.address)
    ).to.be.revertedWithCustomError(contract, "NotAdmin");

    await expect(contract.isManufacturer(manufacturer.address)).to.eventually.equal(true);
    await (await contract.removeServiceCenter(fixture.serviceCenter.address)).wait();
    await expect(
      contract.connect(fixture.serviceCenter).approveClaim("P-001", "S-001", 1)
    ).to.be.revertedWithCustomError(contract, "NotServiceCenter");
  });

  it("AC02: registers immutable products and rejects duplicate IDs or serials", async function () {
    const fixture = await deployFixture();
    const { contract, manufacturer, stranger } = fixture;

    await register(contract, manufacturer);
    const product = await contract.getProduct("P-001", "S-001");
    expect(product.productId).to.equal("P-001");
    expect(product.serialNumber).to.equal("S-001");
    expect(product.currentOwner).to.equal(manufacturer.address);

    await expect(
      contract.connect(manufacturer).registerProduct("P-001", "S-002", "Phone", MONTH, 1)
    ).to.be.revertedWithCustomError(contract, "AlreadyRegistered");
    await expect(
      contract.connect(manufacturer).registerProduct("P-002", "S-001", "Phone", MONTH, 1)
    ).to.be.revertedWithCustomError(contract, "AlreadyRegistered");
    await expect(
      contract.connect(stranger).registerProduct("P-002", "S-002", "Phone", MONTH, 1)
    ).to.be.revertedWithCustomError(contract, "NotManufacturer");
  });

  it("AC03: enforces the two-step ownership path and records transfers", async function () {
    const fixture = await deployFixture();
    const { contract, manufacturer, retailer, customer, secondCustomer, stranger } = fixture;
    await register(contract, manufacturer);

    await expect(
      contract.connect(manufacturer).initiateTransfer("P-001", "S-001", customer.address)
    ).to.be.revertedWithCustomError(contract, "InvalidRolePath");
    await (
      await contract
        .connect(manufacturer)
        .initiateTransfer("P-001", "S-001", retailer.address)
    ).wait();
    await expect(
      contract.connect(stranger).acceptTransfer("P-001", "S-001")
    ).to.be.revertedWithCustomError(contract, "NotTransferRecipient");
    await (await contract.connect(retailer).acceptTransfer("P-001", "S-001")).wait();

    await expect(
      contract.connect(retailer).initiateTransfer("P-001", "S-001", fixture.serviceCenter.address)
    ).to.be.revertedWithCustomError(contract, "InvalidRolePath");
    await (
      await contract
        .connect(retailer)
        .initiateTransfer("P-001", "S-001", customer.address)
    ).wait();
    await (await contract.connect(customer).acceptTransfer("P-001", "S-001")).wait();

    await (
      await contract
        .connect(customer)
        .initiateTransfer("P-001", "S-001", secondCustomer.address)
    ).wait();
    await (await contract.connect(secondCustomer).acceptTransfer("P-001", "S-001")).wait();
    const product = await contract.getProduct("P-001", "S-001");
    expect(product.currentOwner).to.equal(secondCustomer.address);
    expect(product.warrantyStart).to.be.gt(0);
  });

  it("AC03: supports cancellation, rejection, and permissionless timeout cleanup", async function () {
    const fixture = await deployFixture();
    const { contract, manufacturer, retailer, customer, stranger } = fixture;
    await register(contract, manufacturer);

    await (
      await contract
        .connect(manufacturer)
        .initiateTransfer("P-001", "S-001", retailer.address)
    ).wait();
    await (await contract.connect(manufacturer).cancelTransfer("P-001", "S-001")).wait();

    await (
      await contract
        .connect(manufacturer)
        .initiateTransfer("P-001", "S-001", retailer.address)
    ).wait();
    await (await contract.connect(retailer).rejectTransfer("P-001", "S-001")).wait();

    await (await contract.setTransferTimeout(10)).wait();
    await (
      await contract
        .connect(manufacturer)
        .initiateTransfer("P-001", "S-001", retailer.address)
    ).wait();
    await network.provider.send("evm_increaseTime", [11]);
    await network.provider.send("evm_mine");
    await expect(
      contract.connect(stranger).expireTransfer("P-001", "S-001")
    ).to.emit(contract, "OwnershipTransferExpired");
    const pending = await contract.getPendingTransfer("P-001", "S-001");
    expect(pending.exists).to.equal(false);
    expect(customer.address).to.not.equal(retailer.address);
  });

  it("AC04: exposes product verification and ownership data without a wallet", async function () {
    const fixture = await deployFixture();
    await register(fixture.contract, fixture.manufacturer);
    const product = await fixture.contract.getProduct("P-001", "S-001");
    expect(product.exists).to.equal(true);
    expect(product.manufacturer).to.equal(fixture.manufacturer.address);
    expect(await fixture.contract.getProductKey("P-001", "S-001")).to.not.equal(ethers.ZeroHash);
  });

  it("AC05: activates warranty only when the customer accepts the retail transfer", async function () {
    const fixture = await deployFixture();
    await register(fixture.contract, fixture.manufacturer);
    let product = await fixture.contract.getProduct("P-001", "S-001");
    expect(product.warrantyStart).to.equal(0);

    await moveToCustomer(fixture);
    product = await fixture.contract.getProduct("P-001", "S-001");
    expect(product.warrantyStart).to.be.gt(0);
    expect(product.warrantyEnd - product.warrantyStart).to.equal(product.warrantyDuration);
  });

  it("AC06: allows only the current owner to submit one pending claim", async function () {
    const fixture = await deployFixture();
    await register(fixture.contract, fixture.manufacturer);
    await moveToCustomer(fixture);

    await expect(
      fixture.contract.connect(fixture.stranger).submitClaim("P-001", "S-001", 0)
    ).to.be.revertedWithCustomError(fixture.contract, "NotCurrentOwner");
    await (
      await fixture.contract
        .connect(fixture.customer)
        .submitClaim("P-001", "S-001", 1)
    ).wait();
    await expect(
      fixture.contract.connect(fixture.customer).submitClaim("P-001", "S-001", 2)
    ).to.be.revertedWithCustomError(fixture.contract, "ClaimAlreadyPending");
  });

  it("AC07: rejects without consuming quota and approves only once", async function () {
    const fixture = await deployFixture();
    await register(fixture.contract, fixture.manufacturer);
    await moveToCustomer(fixture);
    const { contract, customer, serviceCenter } = fixture;

    await (await contract.connect(customer).submitClaim("P-001", "S-001", 0)).wait();
    await (await contract.connect(serviceCenter).rejectClaim("P-001", "S-001", 1)).wait();
    let product = await contract.getProduct("P-001", "S-001");
    expect(product.approvedClaims).to.equal(0);

    await (await contract.connect(customer).submitClaim("P-001", "S-001", 1)).wait();
    await (await contract.connect(serviceCenter).approveClaim("P-001", "S-001", 2)).wait();
    product = await contract.getProduct("P-001", "S-001");
    expect(product.approvedClaims).to.equal(1);
    await expect(
      contract.connect(serviceCenter).approveClaim("P-001", "S-001", 2)
    ).to.be.revertedWithCustomError(contract, "InvalidClaimStatus");
  });

  it("AC08: keeps approved claims open until a service result is recorded", async function () {
    const fixture = await deployFixture();
    await register(fixture.contract, fixture.manufacturer);
    await moveToCustomer(fixture);
    const { contract, customer, serviceCenter } = fixture;

    await (await contract.connect(customer).submitClaim("P-001", "S-001", 2)).wait();
    await (await contract.connect(serviceCenter).approveClaim("P-001", "S-001", 1)).wait();
    let claim = await contract.getClaim("P-001", "S-001", 1);
    expect(claim.status).to.equal(3);
    await (
      await contract
        .connect(serviceCenter)
        .completeServicing("P-001", "S-001", 1, 1)
    ).wait();
    claim = await contract.getClaim("P-001", "S-001", 1);
    expect(claim.status).to.equal(4);
    expect(claim.serviceResult).to.equal(1);
  });

  it("AC08: lets the original approver finish an approved claim after revocation", async function () {
    const fixture = await deployFixture();
    await register(fixture.contract, fixture.manufacturer);
    await moveToCustomer(fixture);
    const { contract, customer, serviceCenter } = fixture;

    await (await contract.connect(customer).submitClaim("P-001", "S-001", 0)).wait();
    await (await contract.connect(serviceCenter).approveClaim("P-001", "S-001", 1)).wait();
    await (await contract.removeServiceCenter(serviceCenter.address)).wait();
    await (
      await contract.connect(serviceCenter).completeServicing("P-001", "S-001", 1, 2)
    ).wait();
    const claim = await contract.getClaim("P-001", "S-001", 1);
    expect(claim.status).to.equal(4);
  });

  it("AC09: cancels pending claims on transfer but preserves approved claims", async function () {
    const fixture = await deployFixture();
    await register(fixture.contract, fixture.manufacturer);
    await moveToCustomer(fixture);
    const { contract, customer, secondCustomer, serviceCenter } = fixture;

    await (await contract.connect(customer).submitClaim("P-001", "S-001", 0)).wait();
    await (
      await contract
        .connect(customer)
        .initiateTransfer("P-001", "S-001", secondCustomer.address)
    ).wait();
    await (await contract.connect(secondCustomer).acceptTransfer("P-001", "S-001")).wait();
    let claim = await contract.getClaim("P-001", "S-001", 1);
    expect(claim.status).to.equal(5);

    await (await contract.connect(secondCustomer).submitClaim("P-001", "S-001", 1)).wait();
    await (await contract.connect(serviceCenter).approveClaim("P-001", "S-001", 2)).wait();
    await (
      await contract
        .connect(secondCustomer)
        .initiateTransfer("P-001", "S-001", customer.address)
    ).wait();
    await (await contract.connect(customer).acceptTransfer("P-001", "S-001")).wait();
    claim = await contract.getClaim("P-001", "S-001", 2);
    expect(claim.status).to.equal(3);
  });

  it("AC09: blocks new claims after expiry or quota exhaustion", async function () {
    const fixture = await deployFixture();
    await register(fixture.contract, fixture.manufacturer, "P-EXP", "S-EXP", 1);
    await moveToCustomer(fixture, "P-EXP", "S-EXP");
    const { contract, customer, serviceCenter } = fixture;

    await (await contract.connect(customer).submitClaim("P-EXP", "S-EXP", 0)).wait();
    await (await contract.connect(serviceCenter).approveClaim("P-EXP", "S-EXP", 1)).wait();
    await expect(
      contract.connect(customer).submitClaim("P-EXP", "S-EXP", 1)
    ).to.be.revertedWithCustomError(contract, "WarrantyUnavailable");

    await register(contract, fixture.manufacturer, "P-TIME", "S-TIME", 1);
    await moveToCustomer(fixture, "P-TIME", "S-TIME");
    await network.provider.send("evm_increaseTime", [24 * MONTH + 1]);
    await network.provider.send("evm_mine");
    await expect(
      contract.connect(customer).submitClaim("P-TIME", "S-TIME", 0)
    ).to.be.revertedWithCustomError(contract, "WarrantyUnavailable");
  });
});
