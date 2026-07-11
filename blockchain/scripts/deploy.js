const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const { ethers } = require("hardhat");

async function main() {
    const [deployer, device1, device2, device3] = await ethers.getSigners();

    console.log("====================================================");
    console.log("Deploying SX Trading Suite with account:", deployer.address);
    console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());
    console.log("====================================================");

    // 1. Deploy Mock USDT
    console.log("Deploying MockUSDT...");
    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    const usdt = await MockUSDT.deploy();
    await usdt.waitForDeployment();
    const usdtAddr = await usdt.getAddress();
    console.log("MockUSDT deployed to:", usdtAddr);

    // 2. Deploy Mock Oracle
    console.log("Deploying MockOracle...");
    const MockOracle = await ethers.getContractFactory("MockOracle");
    const oracle = await MockOracle.deploy();
    await oracle.waitForDeployment();
    const oracleAddr = await oracle.getAddress();
    console.log("MockOracle deployed to:", oracleAddr);

    // Set some initial prices in Oracle (e.g. USDT price)
    await oracle.setPrice(usdtAddr, 1n * 10n ** 8n); // $1.00
    console.log("Oracle price set for MockUSDT to $1.00");

    // 3. Deploy SXPT (Perpetual Trading)
    console.log("Deploying SXPT...");
    const SXPT = await ethers.getContractFactory("SXPT");
    const sxpt = await SXPT.deploy(usdtAddr, oracleAddr);
    await sxpt.waitForDeployment();
    const sxptAddr = await sxpt.getAddress();
    console.log("SXPT deployed to:", sxptAddr);

    // 4. Deploy SXLT (Asset Lending)
    console.log("Deploying SXLT...");
    const SXLT = await ethers.getContractFactory("SXLT");
    const sxlt = await SXLT.deploy(oracleAddr);
    await sxlt.waitForDeployment();
    const sxltAddr = await sxlt.getAddress();
    console.log("SXLT deployed to:", sxltAddr);

    // 5. Deploy SXLS (Leveraged Spot)
    console.log("Deploying SXLS...");
    const SXLS = await ethers.getContractFactory("SXLS");
    const sxls = await SXLS.deploy(usdtAddr, oracleAddr);
    await sxls.waitForDeployment();
    const sxlsAddr = await sxls.getAddress();
    console.log("SXLS deployed to:", sxlsAddr);

    // 6. Deploy SXUD (Unified Dashboard)
    console.log("Deploying SXUD...");
    const SXUD = await ethers.getContractFactory("SXUD");
    const sxud = await SXUD.deploy(sxptAddr, sxltAddr, sxlsAddr, oracleAddr);
    await sxud.waitForDeployment();
    const sxudAddr = await sxud.getAddress();
    console.log("SXUD deployed to:", sxudAddr);

    // 7. Deploy SXHOP (Hidden Orders)
    console.log("Deploying SXHOP...");
    const SXHOP = await ethers.getContractFactory("SXHOP");
    const sxhop = await SXHOP.deploy(sxlsAddr, usdtAddr);
    await sxhop.waitForDeployment();
    const sxhopAddr = await sxhop.getAddress();
    console.log("SXHOP deployed to:", sxhopAddr);

    // 8. Deploy SXAdmin (MultiSig Admin)
    // For production/script, we specify the three master devices
    const d1 = process.env.DEVICE1_ADDRESS || (device1 ? device1.address : deployer.address);
    const d2 = process.env.DEVICE2_ADDRESS || (device2 ? device2.address : deployer.address);
    const d3 = process.env.DEVICE3_ADDRESS || (device3 ? device3.address : deployer.address);

    console.log(`Deploying SXAdmin with devices: \n  1: ${d1}\n  2: ${d2}\n  3: ${d3}...`);
    const SXAdmin = await ethers.getContractFactory("SXAdmin");
    const sxadmin = await SXAdmin.deploy(d1, d2, d3, sxptAddr, sxltAddr, sxlsAddr);
    await sxadmin.waitForDeployment();
    const sxadminAddr = await sxadmin.getAddress();
    console.log("SXAdmin deployed to:", sxadminAddr);

    // 9. Transfer Ownerships to MultiSig Admin
    console.log("Transferring ownership of core trading contracts to SXAdmin...");
    await (await sxpt.transferOwnership(sxadminAddr)).wait();
    await (await sxlt.transferOwnership(sxadminAddr)).wait();
    await (await sxls.transferOwnership(sxadminAddr)).wait();
    console.log("Ownership transferred successfully.");

    console.log("====================================================");
    console.log("Deployment Complete!");
    console.log("====================================================");
    console.log("");
    console.log("Copy the block below into your backend/.env file:");
    console.log("----------------------------------------------------");
    console.log(`# Hoodi Testnet — deployed ${new Date().toISOString()}`);
    console.log(`RPC_URL=https://rpc.hoodi.ethpandaops.io`);
    console.log(`CHAIN_ID=560048`);
    console.log(`USDT_ADDRESS=${usdtAddr}`);
    console.log(`ORACLE_ADDRESS=${oracleAddr}`);
    console.log(`SXPT_ADDRESS=${sxptAddr}`);
    console.log(`SXLT_ADDRESS=${sxltAddr}`);
    console.log(`SXLS_ADDRESS=${sxlsAddr}`);
    console.log(`SXUD_ADDRESS=${sxudAddr}`);
    console.log(`SXHOP_ADDRESS=${sxhopAddr}`);
    console.log(`SXADMIN_ADDRESS=${sxadminAddr}`);
    console.log("----------------------------------------------------");
    console.log("");
    console.log("Frontend: update NEXT_PUBLIC_API_URL in frontend/.env.local");
    console.log("  NEXT_PUBLIC_API_URL=http://localhost:3000");
    console.log("====================================================");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
