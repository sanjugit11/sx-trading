const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const deployedPath = path.join(__dirname, "../../Deployment_Details.json");
  if (!fs.existsSync(deployedPath)) {
    throw new Error(`Missing deployed addresses file: ${deployedPath}`);
  }

  const deployed = JSON.parse(fs.readFileSync(deployedPath, "utf8"));
  const oracleAddress = deployed.MockOracle;
  const lpAddress = deployed.BlumeLP;

  const oracle = await hre.ethers.getContractAt("MockOracle", oracleAddress);
  const decimals = await oracle.decimals();
  const [, price] = await oracle.latestRoundData();

  console.log("=========================================");
  console.log("MockOracle Address:", oracleAddress);
  console.log("Decimals:", decimals);
  console.log("Oracle Price:", price.toString());
  console.log("Human-readable Price:", hre.ethers.formatUnits(price, decimals));

  const lp = await hre.ethers.getContractAt("BlumeLP", lpAddress);
  const reserve0 = await lp.reserve0();
  const reserve1 = await lp.reserve1();
  console.log("LP Reserve0 (BLX):", hre.ethers.formatEther(reserve0));
  console.log("LP Reserve1 (USDT):", hre.ethers.formatUnits(reserve1, 6));

  const spotPrice = (reserve1 * (10n ** BigInt(decimals)) * (10n ** 18n)) / (reserve0 * (10n ** 6n));
  console.log("Calculated spotPrice:", spotPrice.toString());
  console.log("Human-readable spotPrice:", hre.ethers.formatUnits(spotPrice, decimals));

  const diff = spotPrice > price ? spotPrice - price : price - spotPrice;
  const deviationBps = (diff * 10000n) / price;
  console.log("Deviation Bps:", deviationBps.toString());
  console.log("Max Oracle Deviation Bps:", (await lp.maxOracleDeviationBps()).toString());
  console.log("=========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
