const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  const deployedPath = path.join(__dirname, "../../Deployment_Details.json");
  if (!fs.existsSync(deployedPath)) {
    throw new Error(`Missing deployed addresses file: ${deployedPath}`);
  }

  const deployed = JSON.parse(fs.readFileSync(deployedPath, "utf8"));
  const oracleAddress = deployed.MockOracle;
  const lpAddress = deployed.BlumeLP;

  const oracle = await hre.ethers.getContractAt("MockOracle", oracleAddress, deployer);
  const lp = await hre.ethers.getContractAt("BlumeLP", lpAddress, deployer);

  const decimals = await oracle.decimals();
  const [, oldPrice] = await oracle.latestRoundData();

  const reserve0 = await lp.reserve0();
  const reserve1 = await lp.reserve1();

  const spotPrice = (reserve1 * (10n ** BigInt(decimals)) * (10n ** 18n)) / (reserve0 * (10n ** 6n));

  console.log("=========================================");
  console.log(`Network: ${hre.network.name}`);
  console.log(`MockOracle Address: ${oracleAddress}`);
  console.log(`Current Oracle Price: ${hre.ethers.formatUnits(oldPrice, decimals)}`);
  console.log(`Current LP Spot Price: ${hre.ethers.formatUnits(spotPrice, decimals)}`);
  console.log(`Required Oracle Value: ${spotPrice.toString()}`);

  console.log("Syncing oracle price to match spot price...");
  const tx = await oracle.setPrice(spotPrice);
  console.log(`Transaction submitted: ${tx.hash}`);
  await tx.wait();

  const [, newPrice] = await oracle.latestRoundData();
  console.log(`✓ Oracle Price updated to: ${hre.ethers.formatUnits(newPrice, decimals)}`);
  console.log("=========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
