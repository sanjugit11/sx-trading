const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { body, param, validationResult } = require("express-validator");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// Load Environment variables
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware Setup
app.use(helmet()); // Basic security headers
app.use(cors());   // Enable cross-origin resource sharing
app.use(express.json()); // JSON body parser

// Rate limiting to defend against spam/DDoS
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this IP, please try again after 15 minutes." }
});
app.use("/api/", apiLimiter);

// In-Memory Database (Transaction Logs & Simulation Data)
const db = {
  transactions: []
};

// Web3 Smart Contract Integration Setup
let provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com");
let contractsLoaded = false;
let addresses = getEnvAddresses();

const ADDR_PATH = path.join(__dirname, "../Deployment_Details.json");
const REQUIRED_LIVE_ADDRESSES = ["BLXToken", "BlumeStaking", "BlumeVault", "BlumeLP"];

function getEnvAddresses() {
  let fileAddresses = {};
  try {
    const detailsPath = path.resolve(__dirname, "../Deployment_Details.json");
    if (fs.existsSync(detailsPath)) {
      fileAddresses = JSON.parse(fs.readFileSync(detailsPath, "utf8"));
    }
  } catch (err) {
    console.warn("Could not read local Deployment_Details.json during env setup:", err.message);
  }

  return {
    network: process.env.NETWORK_NAME || fileAddresses.network || "sepolia",
    chainId: Number(process.env.CHAIN_ID || fileAddresses.chainId || 11155111),
    BLXToken: process.env.BLX_TOKEN_ADDRESS || process.env.VITE_BLX_TOKEN_ADDRESS || fileAddresses.BLXToken || "",
    stBLXToken: process.env.STBLX_TOKEN_ADDRESS || process.env.VITE_STBLX_TOKEN_ADDRESS || fileAddresses.stBLXToken || "",
    BlumeStaking: process.env.STAKING_ADDRESS || process.env.VITE_STAKING_ADDRESS || fileAddresses.BlumeStaking || "",
    MockUSDT: process.env.MOCK_USDT_ADDRESS || process.env.VITE_MOCK_USDT_ADDRESS || fileAddresses.MockUSDT || "",
    MockOracle: process.env.MOCK_ORACLE_ADDRESS || process.env.VITE_MOCK_ORACLE_ADDRESS || fileAddresses.MockOracle || "",
    BlumeLP: process.env.LP_ADDRESS || process.env.VITE_LP_ADDRESS || fileAddresses.BlumeLP || "",
    BlumeVault: process.env.VAULT_ADDRESS || process.env.VITE_VAULT_ADDRESS || fileAddresses.BlumeVault || ""
  };
}

function hasRequiredAddresses(source) {
  return REQUIRED_LIVE_ADDRESSES.every((key) => Boolean(source[key]));
}

function normalizeAddressValue(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value.target === "string") return value.target;
  if (typeof value.address === "string") return value.address;
  return "";
}

function normalizeAddresses(source) {
  const normalized = { ...source };
  [
    "BLXToken",
    "stBLXToken",
    "BlumeStaking",
    "MockUSDT",
    "MockOracle",
    "BlumeLP",
    "BlumeVault"
  ].forEach((key) => {
    normalized[key] = normalizeAddressValue(source[key]);
  });
  return normalized;
}

// Minimal Read ABIs for standard ecosystem operations
const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)"
];
const STAKING_ABI = [
  "function totalClassicStaked() view returns (uint256)",
  "function totalLiquidStakedBLX() view returns (uint256)",
  "function rewardRatePerSecond() view returns (uint256)",
  "function liquidStakingAPY() view returns (uint256)",
  "function getstBLXExchangeRate() view returns (uint256)",
  "function getPendingClassicRewards(address user) view returns (uint256)",
  "function getUserStakesCount(address user) view returns (uint256)"
];
const VAULT_ABI = [
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function withdrawalFeeBps() view returns (uint256)",
  "function lockDuration() view returns (uint256)"
];
const LP_ABI = [
  "function reserve0() view returns (uint256)",
  "function reserve1() view returns (uint256)",
  "function totalSupply() view returns (uint256)"
];

function initContracts() {
  try {
    if (fs.existsSync(ADDR_PATH)) {
      addresses = {
        ...getEnvAddresses(),
        ...normalizeAddresses(JSON.parse(fs.readFileSync(ADDR_PATH, "utf8")))
      };

      contractsLoaded = hasRequiredAddresses(addresses);
      console.log("✓ Contract addresses loaded successfully.");
      console.log(`Connected to Network: ${addresses.network} on chain ID: ${addresses.chainId}`);
    } else {
      addresses = getEnvAddresses();
      contractsLoaded = hasRequiredAddresses(addresses);
      console.log("⚠ deployed-addresses.json not found. Using environment contract addresses where available.");
    }
  } catch (error) {
    console.log("⚠ RPC Connection failed. Running in dynamic simulation mode.");
    contractsLoaded = false;
  }
}
initContracts();

// API Endpoints

/**
 * @api {get} /api/stats Get Global Ecosystem Statistics
 * @description Merges live chain data with beautiful simulations when offline.
 */
app.get("/api/stats", async (req, res, next) => {
  try {
    if (contractsLoaded && provider) {
      try {
        const blxContract = new ethers.Contract(addresses.BLXToken, ERC20_ABI, provider);
        const stakingContract = new ethers.Contract(addresses.BlumeStaking, STAKING_ABI, provider);
        const vaultContract = new ethers.Contract(addresses.BlumeVault, VAULT_ABI, provider);
        const lpContract = new ethers.Contract(addresses.BlumeLP, LP_ABI, provider);

        const [
          blxSupply,
          classicStaked,
          liquidStaked,
          stBlxRate,
          vaultAssets,
          lpReserve0,
          lpReserve1,
          lpSupply
        ] = await Promise.all([
          blxContract.totalSupply(),
          stakingContract.totalClassicStaked(),
          stakingContract.totalLiquidStakedBLX(),
          stakingContract.getstBLXExchangeRate(),
          vaultContract.totalAssets(),
          lpContract.reserve0(),
          lpContract.reserve1(),
          lpContract.totalSupply()
        ]);

        const formattedBlxSupply = ethers.formatEther(blxSupply);
        const formattedClassicStaked = ethers.formatEther(classicStaked);
        const formattedLiquidStaked = ethers.formatEther(liquidStaked);
        const formattedVaultAssets = ethers.formatEther(vaultAssets);
        const formattedLpReserve0 = ethers.formatEther(lpReserve0);
        const formattedLpReserve1 = ethers.formatUnits(lpReserve1, 6); // USDT is 6 decimals
        
        // Calculate dynamic token price: reserve1 / reserve0 (USDT per BLX)
        const blxPrice = Number(formattedLpReserve0) > 0 
          ? (Number(formattedLpReserve1) / Number(formattedLpReserve0)) 
          : 0.50;

        const totalTVL = (Number(formattedClassicStaked) + Number(formattedLiquidStaked) + Number(formattedVaultAssets)) * blxPrice + (Number(formattedLpReserve1) * 2);

        return res.json({
          status: "Live On-Chain",
          addresses,
          stats: {
            blxPrice,
            blxSupply: Number(formattedBlxSupply),
            totalTVL,
            staking: {
              classicStaked: Number(formattedClassicStaked),
              liquidStaked: Number(formattedLiquidStaked),
              stBLXRate: Number(ethers.formatEther(stBlxRate)),
              flexibleAPY: 5,
              locked30APY: 10,
              locked90APY: 18,
              locked180APY: 28,
              liquidAPY: 12
            },
            vault: {
              tvl: Number(formattedVaultAssets),
              withdrawalFeeBps: 50,
              lockPeriod: "24 Hours"
            },
            pool: {
              blxReserve: Number(formattedLpReserve0),
              usdtReserve: Number(formattedLpReserve1),
              lpSupply: Number(ethers.formatEther(lpSupply)),
              tradingFeeBps: 30
            }
          }
        });
      } catch (err) {
        console.log("Failed reading from blockchain, using simulated fallback.", err.message);
      }
    }

    return res.json({
      status: "Offline",
      addresses,
      stats: {
        blxPrice: 0,
        blxSupply: 0,
        totalTVL: 0,
        staking: {
          classicStaked: 0,
          liquidStaked: 0,
          stBLXRate: 1,
          flexibleAPY: 5,
          locked30APY: 10,
          locked90APY: 18,
          locked180APY: 28,
          liquidAPY: 12
        },
        vault: {
          tvl: 0,
          withdrawalFeeBps: 50,
          lockPeriod: "24 Hours"
        },
        pool: {
          blxReserve: 0,
          usdtReserve: 0,
          lpSupply: 0,
          tradingFeeBps: 30
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @api {get} /api/wallet/:address Get User Wallet Position Details
 */
app.get(
  "/api/wallet/:address",
  [param("address").isEthereumAddress().withMessage("Invalid Ethereum wallet address format")],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { address } = req.params;

    try {
      if (contractsLoaded && provider) {
        try {
          const blxContract = new ethers.Contract(addresses.BLXToken, ERC20_ABI, provider);
          const stBlxContract = new ethers.Contract(addresses.stBLXToken, ERC20_ABI, provider);
          const stakingContract = new ethers.Contract(addresses.BlumeStaking, STAKING_ABI, provider);
          const vaultContract = new ethers.Contract(addresses.BlumeVault, ERC20_ABI, provider);
          const lpContract = new ethers.Contract(addresses.BlumeLP, ERC20_ABI, provider);
          const usdtContract = new ethers.Contract(addresses.MockUSDT, ERC20_ABI, provider);

          const [
            blxBal,
            stBlxBal,
            vBlxBal,
            lpBal,
            usdtBal,
            pendingClassic
          ] = await Promise.all([
            blxContract.balanceOf(address),
            stBlxContract.balanceOf(address),
            vaultContract.balanceOf(address),
            lpContract.balanceOf(address),
            usdtContract.balanceOf(address),
            stakingContract.getPendingClassicRewards(address)
          ]);

          return res.json({
            address,
            balances: {
              blx: Number(ethers.formatEther(blxBal)),
              stBlx: Number(ethers.formatEther(stBlxBal)),
              vBlx: Number(ethers.formatEther(vBlxBal)),
              lp: Number(ethers.formatEther(lpBal)),
              usdt: Number(ethers.formatUnits(usdtBal, 6)),
              pendingRewards: Number(ethers.formatEther(pendingClassic))
            }
          });
        } catch (err) {
          console.log("Failed reading wallet from blockchain, using simulated fallback.", err.message);
        }
      }

      return res.json({
        address,
        balances: {
          blx: 0,
          stBlx: 0,
          vBlx: 0,
          lp: 0,
          usdt: 0,
          pendingRewards: 0
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @api {post} /api/tx/log Register/Log a DeFi transaction off-chain
 */
app.post(
  "/api/tx/log",
  [
    body("hash").matches(/^0x([A-Fa-f0-9]{64})$/).withMessage("Invalid transaction hash"),
    body("address").isEthereumAddress().withMessage("Invalid user wallet address"),
    body("action").isString().trim().notEmpty().withMessage("Action title required"),
    body("amount").isString().trim().notEmpty().withMessage("Amount descriptor required")
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { hash, address, action, amount } = req.body;

    const newTx = {
      id: `tx_${Date.now()}`,
      hash,
      address,
      action,
      amount,
      status: "Success",
      timestamp: new Date().toISOString()
    };

    db.transactions.unshift(newTx);

    // Keep logs list trimmed to 20 items to prevent RAM bloat
    if (db.transactions.length > 20) {
      db.transactions.pop();
    }

    return res.status(201).json({
      message: "Transaction logged successfully",
      transaction: newTx
    });
  }
);

/**
 * @api {get} /api/tx/history Get Transaction Logs History
 */
app.get("/api/tx/history", (req, res) => {
  return res.json({
    count: db.transactions.length,
    transactions: db.transactions
  });
});

/**
 * @api {post} /api/tx/clear Clear Transaction Logs History
 */
app.post("/api/tx/clear", (req, res) => {
  db.transactions = [];
  return res.json({ message: "Transaction database cleared successfully" });
});

// Blockchain Interaction Endpoints
function normalizePrivateKey(privateKey) {
  if (!privateKey) return "";
  const trimmed = privateKey.trim();
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

const signer = process.env.PRIVATE_KEY
  ? new ethers.Wallet(normalizePrivateKey(process.env.PRIVATE_KEY), provider)
  : provider;

const createContract = (address, abi) => (
  address ? new ethers.Contract(address, abi, signer) : null
);

const contracts = {
  blxToken: createContract(
    process.env.BLX_TOKEN_ADDRESS || addresses.BLXToken,
    require("../blockchain/artifacts/contracts/BLXToken.sol/BLXToken.json").abi
  ),
  staking: createContract(
    process.env.STAKING_ADDRESS || addresses.BlumeStaking,
    require("../blockchain/artifacts/contracts/BlumeStaking.sol/BlumeStaking.json").abi
  ),
  vault: createContract(
    process.env.VAULT_ADDRESS || addresses.BlumeVault,
    require("../blockchain/artifacts/contracts/BlumeVault.sol/BlumeVault.json").abi
  )
};

function requireContract(contract, name) {
  if (!contract) {
    throw new Error(`${name} address is not configured`);
  }
  return contract;
}

function requireSignerAddress() {
  if (!signer.address) {
    throw new Error("PRIVATE_KEY is required for backend write transactions");
  }
  return signer.address;
}

// Get Token Balance
app.get("/api/balance/:address", param("address").isEthereumAddress(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const balance = await requireContract(contracts.blxToken, "BLXToken").balanceOf(req.params.address);
    res.json({ balance: ethers.formatUnits(balance, 18) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stake Tokens
app.post("/api/stake", body("amount").isNumeric(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const amount = ethers.parseUnits(req.body.amount, 18);
    requireSignerAddress();
    await (await requireContract(contracts.blxToken, "BLXToken").approve(addresses.BlumeStaking, amount)).wait();
    const tx = await requireContract(contracts.staking, "BlumeStaking").stakeClassic(amount, 0);
    await tx.wait();
    res.json({ message: "Stake successful", txHash: tx.hash });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Vault Deposit
app.post("/api/vault/deposit", body("amount").isNumeric(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const amount = ethers.parseUnits(req.body.amount, 18);
    const signerAddress = requireSignerAddress();
    await (await requireContract(contracts.blxToken, "BLXToken").approve(addresses.BlumeVault, amount)).wait();
    const tx = await requireContract(contracts.vault, "BlumeVault").deposit(amount, signerAddress);
    await tx.wait();
    res.json({ message: "Deposit successful", txHash: tx.hash });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Vault Withdrawal
app.post("/api/vault/withdraw", body("amount").isNumeric(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const signerAddress = requireSignerAddress();
    const tx = await requireContract(contracts.vault, "BlumeVault").redeem(
      ethers.parseUnits(req.body.amount, 18),
      signerAddress,
      signerAddress
    );
    await tx.wait();
    res.json({ message: "Withdrawal successful", txHash: tx.hash });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error("Unhandled API Error:", err.stack);
  res.status(500).json({
    error: "Internal Server Error",
    message: err.message
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Blume DeFi API server online on port ${PORT}`);
});
