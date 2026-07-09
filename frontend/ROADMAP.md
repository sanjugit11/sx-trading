# Frontend Development Roadmap

This document serves as the complete, structured frontend development roadmap for the Blume Token (BLX) DeFi Ecosystem. It is designed to guide frontend engineers in building, testing, deploying, and maintaining a high-fidelity React dashboard.

---

## Phase 1 – Frontend Architecture

The frontend application uses a Single Page Application (SPA) structure built with React, Vite, and vanilla styling, integrated with EVM compatible web3 providers (Browser Provider/MetaMask).

- **Layout System**: The app uses a responsive, sticky navigation header at the top, a dynamic status bar ribbon displaying platform statistics, and a tabbed component routing framework for dashboard viewports.
- **Design System**: Set up using raw HSL/RGB variables inside CSS `:root` for dark-mode cyberpunk styling (neon purple/cyan accent colors, blurred background ambient orbs, and glassmorphism panels).
- **State Management**: Built on React Context (`Web3Context.jsx`) managing connection status, chain validations, user balances, active lockup stakes, platform TVL stats, and transaction log caches.
- **Blockchain Layer**: Employs Ethers.js (v6) for contract parsing, gas estimating, client signing, and log syncing.
- **Error Handling**: Implements try-catch blocks around all contract writes with browser alert dispatching for user feedback and error stack logging.

---

## Phase 2 – Folder Structure

The project directory structure is organized as follows:

```text
src/
 ├── app/               # Main application wrapper and entry point
 ├── components/        # Reusable visual components (Navbar, Tables, Cards, Modals)
 ├── layouts/           # Master layouts (Dashboard layouts)
 ├── hooks/             # Custom React hooks (useWeb3, useEthers)
 ├── services/          # HTTP API client services
 ├── api/               # Fetch endpoints definition
 ├── blockchain/        # Contract JSON ABIs and provider setups
 ├── store/             # Global states (Contexts/Zustand equivalents)
 ├── providers/         # React Context providers (Web3Provider)
 ├── utils/             # Formatters, address shorteners, and numeric converters
 ├── types/             # TypeScript interfaces and signatures
 ├── constants/         # Static configuration arrays (lockup lengths, APY rates)
 ├── styles/            # Vanilla CSS stylesheets (index.css)
 └── tests/             # Component and integration tests
```

---

## Phase 3 – Routing

The application uses tab-based client viewport routing:

- **Dashboard Portfolio Viewport (`/` - Tab: Overview)**:
  - **Purpose**: Displays the user's balances (BLX, stBLX, vBLX, USDT, LP) and platform parameters.
  - **API Calls**: `GET /api/stats`, `GET /api/tx/history`.
  - **Blockchain Calls**: `balanceOf()`, `getPendingClassicRewards()`.
- **High-Yield Staking Viewport (Tab: Staking)**:
  - **Purpose**: Facilitates classic lockup staking and liquid stBLX minting/redemption.
  - **Blockchain Calls**: `stakeClassic()`, `unstakeClassic()`, `claimClassicRewards()`, `stakeLiquid()`, `unstakeLiquid()`.
- **Liquidity Pool & Swap Viewport (Tab: Swap)**:
  - **Purpose**: Executes token swaps (BLX <-> USDT) and manages LP token deposits/withdrawals.
  - **Blockchain Calls**: `swap()`, `addLiquidity()`, `removeLiquidity()`.
- **Yield Storage Vault Viewport (Tab: Vault)**:
  - **Purpose**: Allows ERC-4626 vault deposits and redemptions.
  - **Blockchain Calls**: `deposit()`, `redeem()`.

---

## Phase 4 – Authentication & Connection Flow

The web3 onboarding flow is configured as follows:

```
1. Click "Connect Wallet" -> Request Browser Accounts (window.ethereum)
2. Detect Chain ID       -> Validate network (Sepolia/Hardhat)
3. Fetch User Address    -> Enable balance listeners & transaction handlers
4. Sign Message (SIWE)   -> Cryptographic validation for backend sessions (Optional)
5. Save State            -> Web3Context updates wallet address & connection status
```

---

## Phase 5 – Layouts

The application implements a Unified Dashboard Layout:

- **Global Navigation Bar**: Displays brand logo, mock USDT faucet link, chain connection indicator, wallet address shortener, and disconnect options.
- **Ecosystem Stats Bar**: Floating glassmorphism cards at the top displaying BLX Spot Price, Ecosystem TVL, Liquid Staking APY, and Circulating supply.
- **Body Panel**: Container displaying the active viewport based on the tab selection.

---

## Phase 6 – Pages & Viewports

### 1. Portfolio Overview Dashboard
- **Components**: Wallet holdings table, protocol contract addresses list, metric summaries card, and recent transaction log tables.
- **Visuals**: Progress bars, gradient texts, and table lists with badges denoting action types.

### 2. High-Yield Staking Terminal
- **Components**: APY tier cards selector, staking form input, liquid staking mint/burn cards, lockup list wrapper, and harvest triggers.
- **Calculations**: Auto-updating stBLX mint estimator based on current exchange rate.

### 3. Swap & LP Liquidity Pool
- **Components**: Double-sided swap inputs, swap arrow toggler, slippage rate calculators, liquidity provision card, and LP shares burning interface.
- **Calculations**: Constant product mathematical pricing formula (`x * y = k`) executed locally to show real-time slippage estimates.

### 4. Yield Storage Vault
- **Components**: EIP-4626 explanation banners, secure deposit fields, share redeem fields, and withdrawal lock warning banners.

---

## Phase 7 to Phase 12 – Extended Modules & Terminals

The development plan includes placeholders for future integrations:
- **Trading Terminal**: Live charts, orderbooks, and margin adjustment sliders.
- **Lending Terminal**: Interest calculators, loan-to-value health factors, and repayment logs.
- **Leveraged Spot**: Take-profit / stop-loss configurations and spot positions.
- **Hidden Orders**: Zero-knowledge proof setups for hidden trades.
- **Admin Panel**: Protocol kill switch controls, parameter modifications, and multisig actions.

---

## Phase 13 – Reusable Components

The UI component library contains:
- `Navbar`: Sticky brand header.
- `StatsCard`: Metric indicator card with custom side glow.
- `Table`: Interactive data table.
- `Button`: Gradient primary buttons with hover translates and spin loaders.
- `Input`: Rounded input wrappers with max indicators.
- `Badge`: Capsule alerts for status indicators.

---

## Phase 14 & 15 – Forms & API Integration

- **Input Sanitization**: Number validation, empty input blocks, and balance exceeding checks.
- **HTTP Client**: Vanilla `fetch` clients communicating with `/api/stats` and `/api/tx/log`.
- **Synchronization**: Local states trigger a `refreshLiveData()` callback upon transaction success to update balances.

---

## Phase 16 & 17 – Blockchain Integration & State Management

- **Contract Providers**: Initiated via `ethers.Contract` using artifact JSON ABIs and signer/provider instances.
- **State Store**: React Context managing:
  - `walletAddress`: string
  - `balances`: `{ blx, stBlx, vBlx, lp, usdt, pendingRewards }`
  - `stats`: `{ blxPrice, totalTVL, staking, vault, pool }`
  - `userStakes`: Array of active stakes

---

## Phase 18 – WebSockets & Real-Time Sync

- **Live Pulls**: Periodically queries backend endpoint `/api/stats` to capture price, reserve, and TVL changes.
- **Local Event Logs**: Updates transaction logging list in real-time when the client confirms transaction hash execution.

---

## Phase 19 – UI/UX Theme Specifications

- **Palette**:
  - Main Background: `#06040a`
  - Panels: `rgba(18, 12, 28, 0.45)` (Glassmorphism)
  - Neon Accent Purple: `#c084fc`
  - Neon Accent Cyan: `#22d3ee`
  - Alert Accent Rose: `#f43f5e`
- **Typography**: `Outfit` font family.
- **Micro-interactions**: Scale translations on hover (`transform: translateY(-2px)`), rotating arrows on swap toggling, and logo pulse animations.

---

## Phase 20 to Phase 22 – Testing, Performance, and Deployment

- **Tests**: Mock Ethereum providers to validate connection UI and check state logic responses.
- **Performance**: Chunked builds separating vendor dependencies (`ethers`, `react-dom`) from application files.
- **Deployment**: Static build output deployed via Nginx or Vercel, with configurations routed back to local port `5000` for backend integration.

---

## Phase 23 – Final Deliverables

- [x] **Frontend Architecture Roadmap**: Detailed in this document.
- [x] **Vite React App**: Full codebase setup.
- [x] **Web3 Provider Context**: Hook integrations.
- [x] **Premium Styling**: Glassmorphism dark layout.
- [x] **API & Contract integrations**: Fully functional connections.
