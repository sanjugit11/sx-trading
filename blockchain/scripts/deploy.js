const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {

  const [deployer] = await hre.ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  console.log("=================================================");
  console.log("Step 1: Deploying BLXToken...");

  // 1. Fetch the factory
  const BLXToken = await hre.ethers.getContractFactory("BLXToken");

  // 2. Start the deployment 
  const blx = await BLXToken.deploy();

  // // 3. Wait for the transaction to be mined (Ethers v6 syntax)
  await blx.waitForDeployment();
  const blxAddress = await blx.getAddress();
  console.log("✓ BLXToken deployed at:", blxAddress);

  // 2. Deploy stBLX Token
  console.log("\nStep 2: Deploying stBLXToken...");
  const stBLXToken = await hre.ethers.getContractFactory("stBLXToken");
  const stBlx = await stBLXToken.deploy();
  await stBlx.waitForDeployment();
  // const stBlxAddress = await stBlx.attach("0xab0598c9812a5f00A412bA3F98be497865A6046d");

  const stBlxAddress = await stBlx.getAddress();
  console.log("✓ stBLXToken deployed at:", stBlxAddress);
//  return;
  // 3. Deploy BlumeStaking
  console.log("\nStep 3: Deploying BlumeStaking...");
  const BlumeStaking = await hre.ethers.getContractFactory("BlumeStaking");
  const staking = await BlumeStaking.deploy(blxAddress, stBlxAddress);
  await staking.waitForDeployment();
  const stakingAddress = await staking.getAddress();
  console.log("✓ BlumeStaking deployed at:", stakingAddress);

  // 4. Set permissions
  console.log("\nStep 4: Setting contract permissions...");
  // Staking contract owns stBLX so it can mint/burn
  let tx = await stBlx.transferOwnership(stakingAddress);
  await tx.wait();
  console.log("✓ stBLXToken ownership transferred to BlumeStaking");

  // Staking contract gets minter rights on BLX to issue rewards
  tx = await blx.addMinter(stakingAddress);
  await tx.wait();
  console.log("✓ BlumeStaking added as minter on BLXToken");

  // 5. Deploy Mock USDT
  console.log("\nStep 5: Deploying Mock USDT...");
  const MockUSDT = await hre.ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDT.deploy();
  await usdt.waitForDeployment();
  const usdtAddress = await usdt.getAddress();
  console.log("✓ MockUSDT deployed at:", usdtAddress);

  // 6. Deploy Mock Chainlink Oracle
  console.log("\nStep 6: Deploying Mock Chainlink Oracle...");
  const MockOracle = await hre.ethers.getContractFactory("MockOracle");
  // Initial price: 1 BLX = 0.50 USDT. Scaled to 6 decimals (standard USDT decimals) -> 500000
  const oracle = await MockOracle.deploy(500000, 6, "BLX / USDT price feed");
  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();
  console.log("✓ MockOracle price feed deployed at:", oracleAddress);

  // 7. Deploy BlumeLP (Liquidity Pool) with Oracle Address
  console.log("\nStep 7: Deploying BlumeLP Pool...");
  const BlumeLP = await hre.ethers.getContractFactory("BlumeLP");
  const lp = await BlumeLP.deploy(blxAddress, usdtAddress, oracleAddress);
  await lp.waitForDeployment();
  const lpAddress = await lp.getAddress();
  console.log("✓ BlumeLP deployed at:", lpAddress);

  // 8. Deploy BlumeVault (Secure Yield Vault) with Staking & Treasury Address
  console.log("\nStep 8: Deploying BlumeVault (EIP-4626)...");
  const BlumeVault = await hre.ethers.getContractFactory("BlumeVault");
  const vault = await BlumeVault.deploy(blxAddress, stakingAddress, deployerAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("✓ BlumeVault deployed at:", vaultAddress);

  // Exclude Staking and LP from BLX transfer limits to avoid whale caps blocking pools setup
  console.log("\nStep 9: Setting BLX Transfer Limits Exclusions...");
  tx = await blx.setExcludeFromLimits(stakingAddress, true);
  await tx.wait();
  tx = await blx.setExcludeFromLimits(lpAddress, true);
  await tx.wait();
  tx = await blx.setExcludeFromLimits(vaultAddress, true);
  await tx.wait();
  console.log("✓ Staking, LP, and Vault excluded from BLX transfer limits");

  // 9. Seeding Initial Pool reserves (BLX / USDT liquidity)
  console.log("\nStep 10: Seeding Liquidity Pool and Vault...");
  const blxAmount = hre.ethers.parseEther("100000"); // 100k BLX (18 decimals)
  const usdtAmount = hre.ethers.parseUnits("50000", 6); // 50k USDT (6 decimals)

  console.log("Approving tokens to BlumeLP pool...");
  tx = await blx.approve(lpAddress, blxAmount);
  await tx.wait();
  tx = await usdt.approve(lpAddress, usdtAmount);
  await tx.wait();

  console.log("Depositing initial reserves to BlumeLP pool...");
  tx = await lp.addLiquidity(blxAmount, usdtAmount);
  await tx.wait();
  console.log("✓ BlumeLP pool seeded with 100,000 BLX and 50,000 USDT!");

  // Approve and deposit to secure yield vault
  const vaultDepositAmount = hre.ethers.parseEther("10000"); // 10k BLX
  console.log("Approving and depositing 10,000 BLX to BlumeVault...");
  tx = await blx.approve(vaultAddress, vaultDepositAmount);
  await tx.wait();
  tx = await vault.deposit(vaultDepositAmount, deployerAddress);
  await tx.wait();
  console.log("✓ BlumeVault seeded with 10,000 BLX!");

  // Stake some in Classic Staking
  const classicStakeAmount = hre.ethers.parseEther("5000"); // 5k BLX
  console.log("Approving and staking 5,000 BLX in BlumeStaking (Classic - 30 days)...");
  tx = await blx.approve(stakingAddress, classicStakeAmount);
  await tx.wait();
  tx = await staking.stakeClassic(classicStakeAmount, 1); // 30 days lock (Index 1)
  await tx.wait();
  console.log("✓ Classic Staking seeded with 5,000 BLX!");

  // Stake some in Liquid Staking
  const liquidStakeAmount = hre.ethers.parseEther("5000"); // 5k BLX
  console.log("Approving and staking 5,000 BLX in BlumeStaking (Liquid)...");
  tx = await blx.approve(stakingAddress, liquidStakeAmount);
  await tx.wait();
  tx = await staking.stakeLiquid(liquidStakeAmount);
  await tx.wait();
  console.log("✓ Liquid Staking seeded with 5,000 BLX!");

  console.log("\n=================================================");
  console.log("Ecosystem deployed successfully!");
  console.log("=================================================");

  // Write addresses to shared json file
  const addresses = {
    network: hre.network.name,
    chainId: hre.network.config.chainId || 31337,
    BLXToken: blxAddress,
    stBLXToken: stBlxAddress,
    BlumeStaking: stakingAddress,
    MockUSDT: usdtAddress,
    MockOracle: oracleAddress,
    BlumeLP: lpAddress,
    BlumeVault: vaultAddress,
    deployer: deployerAddress,
    timestamp: new Date().toISOString()
  };

  const outputPath = path.join(__dirname, "../../Deployment_Details.json");
  fs.writeFileSync(outputPath, JSON.stringify(addresses, null, 2));
  console.log(`Addresses saved to ${outputPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
