# Blume DeFi Ecosystem

A comprehensive decentralized finance (DeFi) ecosystem featuring yield-earning vaults, classical and liquid staking mechanisms, an AMM liquidity pool, and price oracle protection guards.

The project is structured as a multi-component monorepo:
1. **`blockchain/`**: Smart contracts, compilation artifacts, and deployment/utility scripts using Hardhat.
2. **`backend/`**: A Node.js & Express API server that serves global ecosystem statistics and logs transactions.
3. **`frontend/`**: A React & Vite dashboard application that provides a modern, responsive user interface to interact with the backend and the blockchain.

---

## 📂 Project Structure

```text
retest-7/
├── backend/                  # Node.js Express API Server
│   ├── server.js             # Main server logic and API routes
│   └── package.json          # Backend dependencies and run scripts
├── blockchain/               # Smart Contracts & Hardhat Environment
│   ├── contracts/            # Solidity Smart Contracts (BLX, stBLX, Vault, LP, Oracle)
│   ├── scripts/              # Deploy, verify, and mint utility scripts
│   ├── test/                 # Chai/Mocha smart contract test suite
│   ├── hardhat.config.js     # Hardhat network configuration
│   └── package.json          # Blockchain dev dependencies and scripts
├── frontend/                 # React Frontend Dashboard
│   ├── src/                  # App components and Web3 Context provider
│   ├── index.html            # Entry point
│   ├── vite.config.js        # Vite configuration
│   └── package.json          # Frontend packages and scripts
├── .env                      # Universal environment configuration file
└── Deployment_Details.json   # Generated contract addresses mapping
```

---

## ⚙️ Prerequisites

Ensure you have the following installed on your machine:
* **Node.js** (v18+ recommended)
* **npm** (v9+ recommended)
* **MetaMask Browser Extension** (for Web3 wallet interactions)

---

## 🛠️ Installation Flow

Follow these steps to set up the repository locally:

### 1. Configure the Environment variables
Copy the `.env` configuration file to the root of the project workspace. Both the `backend` and `blockchain` components are configured to automatically load this shared `.env` file from the parent directory (`../.env`).

A sample configuration contains:
```env
PRIVATE_KEY = <your-private-key>
ETHERSCAN_API_KEY = <your-etherscan-api-key>
DATABASE_URL = postgresql://postgres:postgres@localhost:5432/project9_db?schema=public
HOODI_RPC_URL = https://rpc.hoodi.ethpandaops.io
```

### 2. Install Blockchain Dependencies
Navigate to the `blockchain/` directory and install the required npm packages:
```bash
cd blockchain
npm install
```

### 3. Install Backend Dependencies
Navigate to the `backend/` directory and install the required Express packages:
```bash
cd backend
npm install
```

### 4. Install Frontend Dependencies
Navigate to the `frontend/` directory and install the Vite/React packages:
```bash
cd frontend
npm install
```

---

## 🧪 Testing Commands

The smart contract test suite validates contract functionality, limits, and yields.

To run the smart contract tests:
```bash
cd blockchain
npm test
```
*Alternatively, you can run:*
```bash
npx hardhat test
```

### What the Test Suite Validates:
1. **BLX Token Anti-Whale Controls**: Ensures transfers exceeding maximum limits (`maxTxAmount`) or target wallets exceeding wallet balance caps (`maxWalletLimit`) are reverted correctly.
2. **Classic Staking Early Withdrawals**: Validates that unstaking before lock maturity correctly charges the $15\%$ early penalty fee and forwards it to the protocol owner.
3. **Liquidity Pool Oracle Protection**: Verifies that swaps are blocked if token reserves deviate beyond allowed margins from the Oracle price feed.
4. **Advanced EIP-4626 Vault**: Tests auto-staking of vault deposits, reward compounding (via `compound()`), and withdraw/redeem operations.

---

## 🚀 Running the Project

You can run the ecosystem either in **Local Node Development Mode** or connect to **Ethereum Sepolia Testnet**.

### Option A: Local Node Development Mode (Recommended)

1. **Start Local Hardhat Blockchain Node**:
   In a separate terminal window, launch a local Ethereum node:
   ```bash
   cd blockchain
   npm run node
   ```

2. **Deploy Smart Contracts Locally**:
   Deploy the smart contracts to the running local network:
   ```bash
   cd blockchain
   npm run deploy:local
   ```
   *This compiles the contracts, deploys them, seeds initial pool liquidity, and creates/updates `Deployment_Details.json` at the root of the project.*

3. **Start the Backend API Server**:
   Start the Node.js backend to provide stats and route endpoints:
   ```bash
   cd backend
   npm run dev
   ```

4. **Start the Frontend Dashboard**:
   Run the Vite development server to view the interface:
   ```bash
   cd frontend
   npm run dev
   ```

---

### Option B: Ethereum Sepolia Testnet Mode

1. **Deploy Smart Contracts to Sepolia**:
   Ensure you have a funded wallet private key in your `.env` file, then run:
   ```bash
   cd blockchain
   npm run deploy:sepolia
   ```

2. **Verify Contracts on Etherscan (Optional)**:
   Verify the deployed contracts on Sepolia:
   ```bash
   cd blockchain
   npx hardhat run scripts/verify.js --network sepolia
   ```

3. **Start the Backend API Server**:
   ```bash
   cd backend
   npm run dev
   ```

4. **Start the Frontend Dashboard**:
   ```bash
   cd frontend
   npm run dev
   ```

---

## 🔗 Connecting MetaMask to Local Node

To test the application locally with a browser wallet:
1. Open **MetaMask** and click on the Network dropdown.
2. Select **Add Network** -> **Add a network manually**.
3. Input the following details:
   * **Network Name**: Hardhat Localhost
   * **RPC URL**: `http://127.0.0.1:8545`
   * **Chain ID**: `31337`
   * **Currency Symbol**: `ETH`
4. Import one of the private keys generated in the terminal log when you ran `npm run node` to access pre-funded development accounts.
