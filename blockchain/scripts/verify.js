const { run } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function verifyContracts() {
  const detailsPath = path.join(__dirname, "../../Deployment_Details.json");
  if (!fs.existsSync(detailsPath)) {
    console.error("Error: Deployment_Details.json not found. Run deployment script first.");
    return;
  }

  const details = JSON.parse(fs.readFileSync(detailsPath, "utf8"));

  const BLXToken = details.BLXToken;
  const stBLXToken = details.stBLXToken;
  const BlumeStaking = details.BlumeStaking;
  const BlumeVault = details.BlumeVault;
  const MockUSDT = details.MockUSDT;
  const MockOracle = details.MockOracle;
  const BlumeLP = details.BlumeLP;

  console.log("Starting verification for network:", details.network);

  try {
    console.log("Verifying BLXToken...");
    await run("verify:verify", {
      address: BLXToken,
      constructorArguments: [],
      contract: "contracts/BLXToken.sol:BLXToken",
    });
  } catch (e) { console.error("BLXToken verify failed:", e.message || e); }

  try {
    console.log("Verifying stBLXToken...");
    await run("verify:verify", {
      address: stBLXToken,
      constructorArguments: [],
      contract: "contracts/stBLXToken.sol:stBLXToken",
    });
  } catch (e) { console.error("stBLXToken verify failed:", e.message || e); }

  try {
    console.log("Verifying BlumeStaking...");
    await run("verify:verify", {
      address: BlumeStaking,
      constructorArguments: [BLXToken, stBLXToken],
      contract: "contracts/BlumeStaking.sol:BlumeStaking",
    });
  } catch (e) { console.error("BlumeStaking verify failed:", e.message || e); }

  try {
    console.log("Verifying MockUSDT...");
    await run("verify:verify", {
      address: MockUSDT,
      constructorArguments: [],
      contract: "contracts/MockUSDT.sol:MockUSDT",
    });
  } catch (e) { console.error("MockUSDT verify failed:", e.message || e); }

  try {
    console.log("Verifying MockOracle...");
    await run("verify:verify", {
      address: MockOracle,
      constructorArguments: [500000, 6, "BLX / USDT price feed"],
      contract: "contracts/MockOracle.sol:MockOracle",
    });
  } catch (e) { console.error("MockOracle verify failed:", e.message || e); }

  try {
    console.log("Verifying BlumeLP...");
    await run("verify:verify", {
      address: BlumeLP,
      constructorArguments: [BLXToken, MockUSDT, MockOracle],
      contract: "contracts/BlumeLP.sol:BlumeLP",
    });
  } catch (e) { console.error("BlumeLP verify failed:", e.message || e); }

  try {
    console.log("Verifying BlumeVault...");
    await run("verify:verify", {
      address: BlumeVault,
      constructorArguments: [BLXToken, BlumeStaking, details.deployer],
      contract: "contracts/BlumeVault.sol:BlumeVault",
    });
  } catch (e) { console.error("BlumeVault verify failed:", e.message || e); }
}

verifyContracts()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });