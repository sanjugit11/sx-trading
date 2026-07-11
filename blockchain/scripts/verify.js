const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const hre = require("hardhat");

// Contract addresses — read from environment variables
const CONTRACTS = {
  MockUSDT: {
    address: process.env.USDT_ADDRESS,
    args: [],
  },
  MockOracle: {
    address: process.env.ORACLE_ADDRESS,
    args: [],
  },
  SXPT: {
    address: process.env.SXPT_ADDRESS,
    args: [process.env.USDT_ADDRESS, process.env.ORACLE_ADDRESS],
  },
  SXLT: {
    address: process.env.SXLT_ADDRESS,
    args: [process.env.ORACLE_ADDRESS],
  },
  SXLS: {
    address: process.env.SXLS_ADDRESS,
    args: [process.env.USDT_ADDRESS, process.env.ORACLE_ADDRESS],
  },
  SXUD: {
    address: process.env.SXUD_ADDRESS,
    args: [
      process.env.SXPT_ADDRESS,
      process.env.SXLT_ADDRESS,
      process.env.SXLS_ADDRESS,
      process.env.ORACLE_ADDRESS,
    ],
  },
  SXHOP: {
    address: process.env.SXHOP_ADDRESS,
    args: [process.env.SXLS_ADDRESS, process.env.USDT_ADDRESS],
  },
  SXAdmin: {
    address: process.env.SXADMIN_ADDRESS,
    args: [
      process.env.DEVICE1_ADDRESS || process.env.DEPLOYER_ADDRESS,
      process.env.DEVICE2_ADDRESS || process.env.DEPLOYER_ADDRESS,
      process.env.DEVICE3_ADDRESS || process.env.DEPLOYER_ADDRESS,
      process.env.SXPT_ADDRESS,
      process.env.SXLT_ADDRESS,
      process.env.SXLS_ADDRESS,
    ],
  },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyContract(contractName, contractConfig) {
  if (!contractConfig.address) {
    console.log(`⚠️  Skipping ${contractName}: address not found in environment variables`);
    return;
  }

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`\n🔍 Verifying ${contractName} at ${contractConfig.address}...`);

      await hre.run("verify:verify", {
        address: contractConfig.address,
        constructorArguments: contractConfig.args,
      });

      console.log(`✅ ${contractName} verified successfully!`);
      return;
    } catch (error) {
      const message = error.message || "";
      if (/already verified/i.test(message)) {
        console.log(`✅ ${contractName} is already verified!`);
        return;
      }

      const isTransientExplorerError = /network request failed|fetch failed|timeout|timed out|socket hang up|ECONNRESET|ETIMEDOUT|429|temporar|try again/i.test(message);
      if (isTransientExplorerError && attempt < maxAttempts) {
        console.warn(`⚠️  Transient verification failure for ${contractName} (attempt ${attempt}/${maxAttempts}). Retrying in 10s...`);
        await sleep(10000);
        continue;
      }

      console.error(`❌ Failed to verify ${contractName}:`, message);
      return;
    }
  }
}

async function main() {
  console.log("====================================================");
  console.log("Contract Verification Script");
  console.log("Network:", hre.network.name);
  console.log("====================================================");

  // Verify all contracts
  for (const [contractName, contractConfig] of Object.entries(CONTRACTS)) {
    await verifyContract(contractName, contractConfig);
  }

  console.log("\n====================================================");
  console.log("Verification Complete!");
  console.log("====================================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
