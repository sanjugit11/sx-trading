require("@nomicfoundation/hardhat-toolbox");
const path = require("path");

// Load .env from the root directory as per instructions
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000000";
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
// HOODI_RPC_URL is set in root .env
const HOODI_TESTNET_RPC_URL = process.env.HOODI_RPC_URL || process.env.HOODI_TESTNET_RPC_URL || "https://rpc.hoodi.ethpandaops.io";

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {},
    baseSepolia: {
      url: BASE_SEPOLIA_RPC_URL,
      accounts: PRIVATE_KEY !== "" ? [PRIVATE_KEY] : [],
    },
    hoodiTestnet: {
      url: HOODI_TESTNET_RPC_URL,
      chainId: 560048,
      accounts: PRIVATE_KEY !== "" ? [`0x${PRIVATE_KEY.replace(/^0x/, "")}`] : [],
    },
  },
  etherscan: {
    // Etherscan v2 expects a single API key plus a custom chain entry.
    apiKey: ETHERSCAN_API_KEY,
    customChains: [
      {
        network: "hoodiTestnet",
        chainId: 560048,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",
          browserURL: "https://hoodi.etherscan.io",
        },
      },
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};







