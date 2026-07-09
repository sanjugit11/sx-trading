const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function normalizeAddress(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value.target === "string") return value.target;
  if (typeof value.address === "string") return value.address;
  return "";
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const amountToMint = process.env.AMOUNT || "10000";

  const deployedPath = path.join(__dirname, "../../Deployment_Details.json");
  if (!fs.existsSync(deployedPath)) {
    throw new Error(`Missing deployed addresses file: ${deployedPath}`);
  }

  const deployed = JSON.parse(fs.readFileSync(deployedPath, "utf8"));
  const blxAddress = normalizeAddress(deployed.BLXToken);
  if (!blxAddress) {
    throw new Error("BLXToken address not found in Deployment_Details.json");
  }

  const blx = await hre.ethers.getContractAt("BLXToken", blxAddress, deployer);
  const amount = hre.ethers.parseEther(amountToMint);

  console.log("=========================================");
  console.log(`Network: ${hre.network.name}`);
  console.log(`BLXToken: ${blxAddress}`);
  console.log(`Minting to deployer: ${deployerAddress}`);
  console.log(`Amount: ${amountToMint} BLX`);

  const tx = await blx.mint(deployerAddress, amount);
  console.log(`Transaction submitted: ${tx.hash}`);
  await tx.wait();

  const balance = await blx.balanceOf(deployerAddress);
  console.log(`Deployer BLX balance: ${hre.ethers.formatEther(balance)} BLX`);
  console.log("Mint completed successfully.");
  console.log("=========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
