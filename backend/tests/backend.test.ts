/**
 * SX Trading Backend — Integration Test Suite
 *
 * Strategy:
 *  1. Spawn `hardhat node` (from the blockchain project) as a subprocess on port 8545
 *  2. Deploy all contracts via ethers ContractFactory against that local node
 *  3. Monkey-patch blockchainService so all contract instances point at local contracts
 *  4. NODE_ENV=test (set in npm test script) prevents server.ts from calling listen()
 *  5. Use supertest to make HTTP requests directly against the express app
 */

import request from "supertest";
import { expect } from "chai";
import { ethers } from "ethers";
import { PrismaClient } from "@prisma/client";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";

import { app } from "../src/server";
import { blockchainService } from "../src/blockchain/service";

const prisma = new PrismaClient();

// ── Load compiled artifact JSON from blockchain project ──────────────────────
const ARTIFACTS_DIR = path.resolve(__dirname, "../../blockchain/artifacts/contracts");

function loadArtifact(name: string): { abi: ethers.InterfaceAbi; bytecode: string } {
  const filePath = path.join(ARTIFACTS_DIR, `${name}.sol`, `${name}.json`);
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return { abi: json.abi, bytecode: json.bytecode };
}

async function deploy(
  factory: ethers.ContractFactory,
  ...args: unknown[]
): Promise<ethers.BaseContract & { getAddress(): Promise<string> }> {
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  return contract as ethers.BaseContract & { getAddress(): Promise<string> };
}

// ════════════════════════════════════════════════════════════════════════════════
describe("SX Trading Backend - Integration Test Suite", () => {
  let sessionToken: string;
  let hardhatNode: ChildProcess;
  let localProvider: ethers.JsonRpcProvider;

  // Hardhat Account #1 — test user (not deployer)
  const userAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const userPrivKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
  const userWallet = new ethers.Wallet(userPrivKey);

  // Will be set after deployment
  let usdtAddress: string;
  let collateralAddress: string;

  // ── Helpers ────────────────────────────────────────────────────────────────
  function killPort8545(): Promise<void> {
    return new Promise(resolve => {
      // Kill any stale process on port 8545 before starting a fresh one
      const { exec } = require("child_process");
      exec("lsof -ti:8545 | xargs kill -9", () => setTimeout(resolve, 500));
    });
  }

  function waitForNodeReady(provider: ethers.JsonRpcProvider, retries = 30): Promise<void> {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const poll = setInterval(async () => {
        try {
          await provider.getBlockNumber();
          clearInterval(poll);
          resolve();
        } catch {
          if (++attempts >= retries) {
            clearInterval(poll);
            reject(new Error("Hardhat node did not start in time"));
          }
        }
      }, 500);
    });
  }

  // ── before: start node, deploy contracts, patch service ───────────────────
  before(async function () {
    this.timeout(120_000);

    // Kill any stale hardhat node from a previous test run
    await killPort8545();

    // 1. Spawn hardhat node on port 8545 (detached = own process group for clean kill)
    hardhatNode = spawn(
      "npx", ["hardhat", "node", "--port", "8545"],
      {
        cwd: path.resolve(__dirname, "../../blockchain"),
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      }
    );
    hardhatNode.unref(); // Don't keep parent alive for this subprocess

    hardhatNode.stdout?.on("data", () => {}); // drain stdout silently
    hardhatNode.stderr?.on("data", () => {}); // drain stderr silently

    localProvider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    await waitForNodeReady(localProvider);

    // Reset the chain to guarantee nonce 0 for the deployer (prevents stale nonce issues)
    await localProvider.send("hardhat_reset", []);

    // 2. Deploy contracts using Hardhat Account #0 (owner/deployer)
    // Wrap in NonceManager so sequential deploys don't hit nonce caching bugs
    const deployerBase = new ethers.Wallet(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      localProvider
    );
    const deployer = new ethers.NonceManager(deployerBase);

    const MockUSDTArt     = loadArtifact("MockUSDT");
    const MockOracleArt   = loadArtifact("MockOracle");
    const SXPTArt         = loadArtifact("SXPT");
    const SXLTArt         = loadArtifact("SXLT");
    const SXLSArt         = loadArtifact("SXLS");
    const SXUDArt         = loadArtifact("SXUD");
    const SXHOPArt        = loadArtifact("SXHOP");

    const usdt       = await deploy(new ethers.ContractFactory(MockUSDTArt.abi, MockUSDTArt.bytecode, deployer));
    const collateral = await deploy(new ethers.ContractFactory(MockUSDTArt.abi, MockUSDTArt.bytecode, deployer));
    const oracle     = await deploy(new ethers.ContractFactory(MockOracleArt.abi, MockOracleArt.bytecode, deployer));

    usdtAddress       = await usdt.getAddress();
    collateralAddress = await collateral.getAddress();
    const oracleAddr  = await oracle.getAddress();

    // Set oracle prices: USDT = $1, collateral = $10
    await ((oracle as any).setPrice(usdtAddress,       1n * 10n ** 8n) as Promise<ethers.ContractTransactionResponse>).then(tx => tx.wait());
    await ((oracle as any).setPrice(collateralAddress, 10n * 10n ** 8n) as Promise<ethers.ContractTransactionResponse>).then(tx => tx.wait());

    const sxpt = await deploy(new ethers.ContractFactory(SXPTArt.abi, SXPTArt.bytecode, deployer), usdtAddress, oracleAddr);
    const sxlt = await deploy(new ethers.ContractFactory(SXLTArt.abi, SXLTArt.bytecode, deployer), oracleAddr);
    const sxls = await deploy(new ethers.ContractFactory(SXLSArt.abi, SXLSArt.bytecode, deployer), usdtAddress, oracleAddr);

    const sxud = await deploy(
      new ethers.ContractFactory(SXUDArt.abi, SXUDArt.bytecode, deployer),
      await sxpt.getAddress(), await sxlt.getAddress(), await sxls.getAddress(), oracleAddr
    );

    const sxhop = await deploy(
      new ethers.ContractFactory(SXHOPArt.abi, SXHOPArt.bytecode, deployer),
      await sxls.getAddress(), usdtAddress
    );

    // 3. Monkey-patch blockchainService: point all contracts at local node
    const patch = (field: string, addr: string, abi: ethers.InterfaceAbi) => {
      (blockchainService as any)[field] = new ethers.Contract(addr, abi, deployer);
    };

    (blockchainService as any).provider = localProvider;
    (blockchainService as any).wallet   = deployer;

    patch("oracle", oracleAddr,                    (blockchainService as any).oracle.interface);
    patch("usdt",   usdtAddress,                   (blockchainService as any).usdt.interface);
    patch("sxpt",   await sxpt.getAddress(),       (blockchainService as any).sxpt.interface);
    patch("sxlt",   await sxlt.getAddress(),       (blockchainService as any).sxlt.interface);
    patch("sxls",   await sxls.getAddress(),       (blockchainService as any).sxls.interface);
    patch("sxud",   await sxud.getAddress(),       (blockchainService as any).sxud.interface);
    patch("sxhop",  await sxhop.getAddress(),      (blockchainService as any).sxhop.interface);

    // 4. Clean DB slate
    await prisma.perpetualPosition.deleteMany({});
    await prisma.lendingLoan.deleteMany({});
    await prisma.leveragedSpot.deleteMany({});
    await prisma.hiddenOrder.deleteMany({});
    await prisma.wallet.deleteMany({});
    await prisma.user.deleteMany({});
  });

  // ══════════════════════════════════════════════════════════════════════════
  describe("1. Authentication / SIWE Flow", () => {
    it("should reject access to protected endpoints without a token", async () => {
      const res = await request(app).get("/api/user/profile");
      expect(res.status).to.equal(401);
      expect(res.body.error).to.include("Token missing");
    });

    it("should authenticate a user with a valid SIWE signature", async () => {
      const message = `Sign in to SX Trading Suite: ${userAddress.toLowerCase()}`;
      const signature = await userWallet.signMessage(message);

      const res = await request(app)
        .post("/api/auth/verify")
        .send({ address: userAddress, message, signature });

      expect(res.status).to.equal(200);
      expect(res.body.accessToken).to.be.a("string");
      sessionToken = res.body.accessToken;
    });

    it("should reject login with a mismatched signature", async () => {
      const message = `Sign in to SX Trading Suite: ${userAddress.toLowerCase()}`;
      const signature = await ethers.Wallet.createRandom().signMessage(message);

      const res = await request(app)
        .post("/api/auth/verify")
        .send({ address: userAddress, message, signature });

      expect(res.status).to.equal(401);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  describe("2. Protected Endpoints (Profile & Dashboard)", () => {
    it("should retrieve user profile", async () => {
      const res = await request(app)
        .get("/api/user/profile")
        .set("Authorization", `Bearer ${sessionToken}`);

      expect(res.status).to.equal(200);
      expect(res.body.address).to.equal(userAddress.toLowerCase());
      expect(res.body.wallet.balanceUSD).to.equal(10000.0);
    });

    it("should retrieve dashboard metrics from local contracts", async () => {
      const res = await request(app)
        .get("/api/dashboard")
        .set("Authorization", `Bearer ${sessionToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property("totalExposureUSD");
      expect(res.body).to.have.property("totalCollateralUSD");
      expect(res.body).to.have.property("riskScore");
      // Fresh user — zero positions
      expect(res.body.totalExposureUSD).to.equal("0.0");
      expect(res.body.riskScore).to.equal(0);
    });

    it("should return oracle market price for local USDT asset", async () => {
      const res = await request(app)
        .get(`/api/market/${usdtAddress}`)
        .set("Authorization", `Bearer ${sessionToken}`);

      expect(res.status).to.equal(200);
      expect(res.body.price).to.equal(1);       // $1 from oracle
      expect(res.body).to.have.property("fundingRate");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  describe("3. Trading Operations", () => {
    it("should open a perpetual position and record it in the database", async () => {
      const res = await request(app)
        .post("/api/perpetual/open")
        .set("Authorization", `Bearer ${sessionToken}`)
        .send({ asset: usdtAddress, leverage: 10, marginAmount: 250, isLong: true, isCross: false });

      expect(res.status).to.equal(201);
      expect(res.body.position.asset).to.equal(usdtAddress.toLowerCase());
      expect(res.body.position.leverage).to.equal(10);
      expect(res.body.position.size).to.equal(2500);
      expect(res.body.position.isOpen).to.be.true;
    });

    it("should open a leveraged spot position", async () => {
      const res = await request(app)
        .post("/api/spot/open")
        .set("Authorization", `Bearer ${sessionToken}`)
        .send({ targetAsset: collateralAddress, collateralAmount: 500, leverage: 3, isLimit: false });

      expect(res.status).to.equal(201);
      expect(res.body.spot.leverage).to.equal(3);
      expect(res.body.spot.size).to.equal(1500);
      expect(res.body.spot.isPending).to.be.false;
    });

    it("should reject lending borrow requests violating 250% LTV", async () => {
      // $100 borrow, $100 collateral = 100% LTV — violates 250% min
      const res = await request(app)
        .post("/api/lending/borrow")
        .set("Authorization", `Bearer ${sessionToken}`)
        .send({ borrowAsset: usdtAddress, borrowAmount: 1000, collateralAsset: usdtAddress, collateralAmount: 100 });

      expect(res.status).to.equal(400);
      expect(res.body.error).to.include("LTV violation");
    });

    it("should approve lending borrow requests satisfying 250% LTV", async () => {
      // $100 borrow, $300 collateral = 300% LTV ≥ 250% ✓
      const res = await request(app)
        .post("/api/lending/borrow")
        .set("Authorization", `Bearer ${sessionToken}`)
        .send({ borrowAsset: usdtAddress, borrowAmount: 100, collateralAsset: usdtAddress, collateralAmount: 300 });

      expect(res.status).to.equal(201);
      expect(res.body.loan.isOpen).to.be.true;
    });

    it("should place a hidden order commitment", async () => {
      const commitment = ethers.keccak256(ethers.toUtf8Bytes("test-order-secret-xyz"));
      const proof = "0x" + "ab".repeat(64); // 64-byte mock ZK proof
      const res = await request(app)
        .post("/api/hidden/place")
        .set("Authorization", `Bearer ${sessionToken}`)
        .send({ commitment, proof });

      expect(res.status).to.equal(201);
      expect(res.body.order.commitment).to.equal(commitment);
      expect(res.body.order.status).to.equal("PENDING");
    });
  });

  // ─── Teardown ─────────────────────────────────────────────────────────────
  after(async () => {
    await prisma.$disconnect();
    // Kill the hardhat node subprocess and its entire process group
    if (hardhatNode && hardhatNode.pid) {
      try {
        process.kill(-(hardhatNode.pid as number), "SIGKILL");
      } catch {
        hardhatNode.kill("SIGKILL");
      }
    }
    // Also forcibly clean port 8545
    const { exec } = require("child_process");
    exec("lsof -ti:8545 | xargs kill -9");
    setTimeout(() => process.exit(0), 300);
  });
});
