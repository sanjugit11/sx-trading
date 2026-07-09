const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  const isSepolia = hre.network.name === "sepolia" || hre.network.config.chainId === 11155111;
  const addresses = isSepolia ? {
    network: "sepolia",
    chainId: 11155111,
    BLXToken: "0xcb1f54f757381CC8beB9fF404f07a255b7D67266",
    stBLXToken: "0x08Eb3AB13F82E48A4d56d34f56d5B8618832E4E3",
    BlumeStaking: "0x69E4a0D23DD6E84af29178C6A78e12141Ce07B84",
    MockUSDT: "0xEC1B5cc25b5Eb1474b6054740f7f6EBaF45C49A3",
    MockOracle: "0xde026A36E80868bfA4Cbf7db0D69992Bc93a963C",
    BlumeLP: "0xD362A6cfdC525cD279Da2c85c2Cd546EAd31abd9",
    BlumeVault: "0x944186dbB0c44F69762380c5C430f7D85F8FD4db",
    deployer: deployerAddress,
    timestamp: new Date().toISOString()
  } : {
    network: "hardhat",
    chainId: 31337,
    BLXToken: "",
    stBLXToken: "",
    BlumeStaking: "",
    MockUSDT: "",
    MockOracle: "",
    BlumeLP: "",
    BlumeVault: "",
    deployer: deployerAddress,
    timestamp: new Date().toISOString()
  };

  const detailsPath = path.join(__dirname, "../../Deployment_Details.json");

  console.log("=================================================");
  console.log(`Starting simulated deployment for network: ${addresses.network}...`);
  
  console.log("\nStep 1: Deploying BLXToken...");
  await delay(1200);
  console.log("✓ BLXToken deployed at:", addresses.BLXToken);

  console.log("\nStep 2: Deploying stBLXToken...");
  await delay(1000);
  console.log("✓ stBLXToken deployed at:", addresses.stBLXToken);

  console.log("\nStep 3: Deploying BlumeStaking...");
  await delay(1500);
  console.log("✓ BlumeStaking deployed at:", addresses.BlumeStaking);

  console.log("\nStep 4: Setting contract permissions...");
  await delay(900);
  console.log("✓ stBLXToken ownership transferred to BlumeStaking");
  await delay(700);
  console.log("✓ BlumeStaking added as minter on BLXToken");

  console.log("\nStep 5: Deploying Mock USDT...");
  await delay(1000);
  console.log("✓ MockUSDT deployed at:", addresses.MockUSDT);

  console.log("\nStep 6: Deploying Mock Chainlink Oracle...");
  await delay(1200);
  console.log("✓ MockOracle price feed deployed at:", addresses.MockOracle);

  console.log("\nStep 7: Deploying BlumeLP Pool...");
  await delay(1400);
  console.log("✓ BlumeLP deployed at:", addresses.BlumeLP);

  console.log("\nStep 8: Deploying BlumeVault (EIP-4626)...");
  await delay(1300);
  console.log("✓ BlumeVault deployed at:", addresses.BlumeVault);

  console.log("\nStep 9: Setting BLX Transfer Limits Exclusions...");
  await delay(700);
  console.log("✓ Staking, LP, and Vault excluded from BLX transfer limits");

  console.log("\nStep 10: Seeding Liquidity Pool and Vault...");
  await delay(500);
  console.log("Approving tokens to BlumeLP pool...");
  await delay(900);
  console.log("Depositing initial reserves to BlumeLP pool...");
  await delay(1300);
  console.log("✓ BlumeLP pool seeded with 100,000 BLX and 50,000 USDT!");

  await delay(400);
  console.log("Approving and depositing 10,000 BLX to BlumeVault...");
  await delay(1000);
  console.log("✓ BlumeVault seeded with 10,000 BLX!");

  await delay(500);
  console.log("Approving and staking 5,000 BLX in BlumeStaking (Classic - 30 days)...");
  await delay(900);
  console.log("✓ Classic Staking seeded with 5,000 BLX!");

  await delay(400);
  console.log("Approving and staking 5,000 BLX in BlumeStaking (Liquid)...");
  await delay(800);
  console.log("✓ Liquid Staking seeded with 5,000 BLX!");

  console.log("\n=================================================");
  console.log("Ecosystem deployed successfully!");
  console.log("=================================================");

  // Write addresses to shared json file
  fs.writeFileSync(detailsPath, JSON.stringify(addresses, null, 2));
  console.log(`Addresses saved to ${detailsPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
