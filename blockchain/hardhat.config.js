require("@nomicfoundation/hardhat-toolbox");
const path = require("path");

// Load .env from the root directory as per instructions
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000000";
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const HOODI_TESTNET_RPC_URL = process.env.HOODI_TESTNET_RPC_URL || process.env.HOODI_RPC_URL || "https://rpc.hoodi.network";

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
      accounts: PRIVATE_KEY !== "" ? [PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      // Base Sepolia uses Basescan — same key format as Etherscan
      baseSepolia: ETHERSCAN_API_KEY,
      // Hoodi is an Ethereum-based testnet — uses Etherscan key
      hoodiTestnet: ETHERSCAN_API_KEY,
    },
    customChains: [
      {
        network: "hoodiTestnet",
        chainId: 560048,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=560048",
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







