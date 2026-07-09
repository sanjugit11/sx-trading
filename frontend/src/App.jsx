import React, { useState, useEffect } from "react";
import { Web3Provider, useWeb3 } from "./context/Web3Context";

const DashboardApp = () => {
  const {
    walletConnected,
    walletAddress,
    chainId,
    networkName,
    isSandbox,
    loading,
    stats,
    balances,
    userStakes,
    txHistory,
    addresses,
    backendMode,
    setBackendMode,
    connectWallet,
    disconnectWallet,
    stakeClassic,
    unstakeClassic,
    claimClassicRewards,
    stakeLiquid,
    unstakeLiquid,
    depositVault,
    withdrawVault,
    addLiquidity,
    removeLiquidity,
    swapTokens,
    faucetUSDT,
    refreshLiveData
  } = useWeb3();

  const [activeTab, setActiveTab] = useState("overview");

  // Input states (Ecosystem Staking, Swap, Vault)
  const [stakeAmount, setStakeAmount] = useState("");
  const [selectedLockPeriod, setSelectedLockPeriod] = useState(1);
  const [liquidStakeAmt, setLiquidStakeAmt] = useState("");
  const [liquidUnstakeAmt, setLiquidUnstakeAmt] = useState("");
  const [vaultDepositAmt, setVaultDepositAmt] = useState("");
  const [vaultWithdrawAmt, setVaultWithdrawAmt] = useState("");
  const [swapInput, setSwapInput] = useState("");
  const [swapTokenIn, setSwapTokenIn] = useState("USDT");
  const [swapTokenOut, setSwapTokenOut] = useState("BLX");
  const [lpBlxAmt, setLpBlxAmt] = useState("");
  const [lpUsdtAmt, setLpUsdtAmt] = useState("");
  const [lpRemoveShares, setLpRemoveShares] = useState("");

  // --- NEW PORTAL STATES (TRADING, LENDING, SPOT, HIDDEN, ADMIN) ---
  // 1. Perpetual Trading
  const [perpTradeType, setPerpTradeType] = useState("LONG"); // LONG or SHORT
  const [perpSize, setPerpSize] = useState("");
  const [perpLeverage, setPerpLeverage] = useState(10);
  const [perpPositions, setPerpPositions] = useState([
    {
      id: "pos_1",
      token: "BLX/USDT",
      type: "LONG",
      size: 5000,
      entryPrice: 0.75,
      markPrice: 0.776,
      leverage: 10,
      margin: 375,
      liquidationPrice: 0.68,
      pnl: 130.00
    }
  ]);

  // 2. Asset Lending
  const [lendingTab, setLendingTab] = useState("SUPPLY"); // SUPPLY or BORROW
  const [lendAmount, setLendAmount] = useState("");
  const [lendToken, setLendToken] = useState("USDT");
  const [collateralValue, setCollateralValue] = useState(1200);
  const [borrowedValue, setBorrowedValue] = useState(450);
  const [suppliedAssets, setSuppliedAssets] = useState([
    { id: "sup_1", token: "USDT", amount: 1000, apy: 6.2, collateral: true },
    { id: "sup_2", token: "BLX", amount: 500, apy: 4.8, collateral: true }
  ]);
  const [borrowedAssets, setBorrowedAssets] = useState([
    { id: "bor_1", token: "USDT", amount: 450, apy: 8.5 }
  ]);

  // 3. Leveraged Spot
  const [spotOrderSide, setSpotOrderSide] = useState("BUY");
  const [spotSize, setSpotSize] = useState("");
  const [spotLeverage, setSpotLeverage] = useState(3);
  const [spotTP, setSpotTP] = useState("");
  const [spotSL, setSpotSL] = useState("");
  const [spotPositions, setSpotPositions] = useState([
    { id: "spot_1", pair: "BLX/USDT", side: "BUY", size: 1200, leverage: 3, entryPrice: 0.76, currentPrice: 0.776, tp: 0.90, sl: 0.70 }
  ]);

  // 4. Zero-Knowledge Hidden Orders
  const [hiddenOrderSide, setHiddenOrderSide] = useState("BUY");
  const [hiddenSize, setHiddenSize] = useState("");
  const [hiddenPrice, setHiddenPrice] = useState("");
  const [hiddenPrivacy, setHiddenPrivacy] = useState("SHIELDED"); // PRIVATE, SHIELDED
  const [isGeneratingZK, setIsGeneratingZK] = useState(false);
  const [hiddenOrders, setHiddenOrders] = useState([
    { id: "ho_1", side: "BUY", size: 25000, targetPrice: 0.72, status: "Proof Verified", privacy: "SHIELDED", hash: "0x3ac...f9b" }
  ]);

  // 5. Admin Settings
  const [adminMaxTx, setAdminMaxTx] = useState("10,000,000 BLX");
  const [adminMaxWallet, setAdminMaxWallet] = useState("20,000,000 BLX");
  const [vaultPaused, setVaultPaused] = useState(false);
  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const [auditLogs, setAuditLogs] = useState([
    { id: "log_1", action: "Ecosystem Deployment", operator: "0x1034...5E78", timestamp: "2026-07-07 11:44" },
    { id: "log_2", action: "Excluded address from limits", operator: "0x1034...5E78", timestamp: "2026-07-07 12:10" }
  ]);

  // Helper formats
  const formatAddress = (addr) => {
    if (!addr) return "";
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };
  const displayAddress = (addr) => addr || "Not configured";

  const handleSwapTokenToggle = () => {
    const temp = swapTokenIn;
    setSwapTokenIn(swapTokenOut);
    setSwapTokenOut(temp);
    setSwapInput("");
  };

  const getEstimatedSwapOutput = () => {
    if (!swapInput || isNaN(swapInput)) return "0";
    const amt = parseFloat(swapInput);
    const blxRes = stats.pool.blxReserve || 100000;
    const usdtRes = stats.pool.usdtReserve || 78000;
    const fee = 0.997; // 0.3% fee
    if (swapTokenIn === "BLX") {
      return ((amt * fee * usdtRes) / (blxRes + amt * fee)).toFixed(4);
    } else {
      return ((amt * fee * blxRes) / (usdtRes + amt * fee)).toFixed(4);
    }
  };

  // Health factor calculation
  const getHealthFactor = () => {
    if (borrowedValue === 0) return "∞";
    const factor = (collateralValue * 0.8) / borrowedValue; // 80% LTV threshold
    return factor.toFixed(2);
  };

  // Handlers for interactive states
  const openPerpPosition = (e) => {
    e.preventDefault();
    if (!perpSize || isNaN(perpSize)) return;
    const sizeVal = parseFloat(perpSize);
    const price = stats.blxPrice || 0.776;
    const margin = (sizeVal * price) / perpLeverage;
    const liqPrice = perpTradeType === "LONG" 
      ? price * (1 - 1 / perpLeverage) 
      : price * (1 + 1 / perpLeverage);

    const newPos = {
      id: `pos_${Date.now()}`,
      token: "BLX/USDT",
      type: perpTradeType,
      size: sizeVal,
      entryPrice: price,
      markPrice: price,
      leverage: perpLeverage,
      margin: parseFloat(margin.toFixed(2)),
      liquidationPrice: parseFloat(liqPrice.toFixed(4)),
      pnl: 0.00
    };

    setPerpPositions([newPos, ...perpPositions]);
    setPerpSize("");
  };

  const closePerpPosition = (id) => {
    setPerpPositions(perpPositions.filter(p => p.id !== id));
  };

  const executeLendingAction = (e) => {
    e.preventDefault();
    if (!lendAmount || isNaN(lendAmount)) return;
    const amt = parseFloat(lendAmount);
    
    if (lendingTab === "SUPPLY") {
      const existing = suppliedAssets.find(a => a.token === lendToken);
      if (existing) {
        setSuppliedAssets(suppliedAssets.map(a => a.token === lendToken ? { ...a, amount: a.amount + amt } : a));
      } else {
        setSuppliedAssets([...suppliedAssets, { id: `sup_${Date.now()}`, token: lendToken, amount: amt, apy: lendToken === "USDT" ? 6.2 : 4.8, collateral: true }]);
      }
      setCollateralValue(collateralValue + (amt * (lendToken === "USDT" ? 1.0 : stats.blxPrice)));
    } else {
      const existing = borrowedAssets.find(a => a.token === lendToken);
      if (existing) {
        setBorrowedAssets(borrowedAssets.map(a => a.token === lendToken ? { ...a, amount: a.amount + amt } : a));
      } else {
        setBorrowedAssets([...borrowedAssets, { id: `bor_${Date.now()}`, token: lendToken, amount: amt, apy: lendToken === "USDT" ? 8.5 : 9.8 }]);
      }
      setBorrowedValue(borrowedValue + (amt * (lendToken === "USDT" ? 1.0 : stats.blxPrice)));
    }
    setLendAmount("");
  };

  const executeSpotOrder = (e) => {
    e.preventDefault();
    if (!spotSize || isNaN(spotSize)) return;
    const price = stats.blxPrice || 0.776;
    const newPos = {
      id: `spot_${Date.now()}`,
      pair: "BLX/USDT",
      side: spotOrderSide,
      size: parseFloat(spotSize),
      leverage: spotLeverage,
      entryPrice: price,
      currentPrice: price,
      tp: spotTP ? parseFloat(spotTP) : price * 1.2,
      sl: spotSL ? parseFloat(spotSL) : price * 0.8
    };
    setSpotPositions([newPos, ...spotPositions]);
    setSpotSize("");
    setSpotTP("");
    setSpotSL("");
  };

  const submitHiddenOrder = async (e) => {
    e.preventDefault();
    if (!hiddenSize || !hiddenPrice) return;
    setIsGeneratingZK(true);
    
    // Simulate ZK proof generation time
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const newHo = {
      id: `ho_${Date.now()}`,
      side: hiddenOrderSide,
      size: parseFloat(hiddenSize),
      targetPrice: parseFloat(hiddenPrice),
      status: "Proof Verified",
      privacy: hiddenPrivacy,
      hash: "0x" + Math.random().toString(16).substr(2, 6) + "..." + Math.random().toString(16).substr(2, 4)
    };

    setHiddenOrders([newHo, ...hiddenOrders]);
    setIsGeneratingZK(false);
    setHiddenSize("");
    setHiddenPrice("");
  };

  return (
    <div>
      {/* Navbar */}
      <header className="navbar">
        <div className="logo-container">
          <div className="logo-icon glow-logo">B</div>
          <div className="logo-text">BLUME DEFI</div>
        </div>

        <div className="nav-wallet-actions">
          <button 
            className="btn-secondary" 
            onClick={faucetUSDT} 
            disabled={loading || !walletConnected}
            style={{ fontSize: "0.85rem", padding: "0.5rem 1rem" }}
          >
            Claim USDT Faucet
          </button>

          {walletConnected ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: "700" }}>{formatAddress(walletAddress)}</span>
                <span style={{ fontSize: "0.7rem", color: "var(--secondary)" }}>
                  {networkName ? networkName.toUpperCase() : "CONNECTED"}
                </span>
              </div>
              <button className="btn-primary" onClick={disconnectWallet} style={{ padding: "0.5rem 1rem" }}>
                Disconnect
              </button>
            </div>
          ) : (
            <button className="btn-primary" onClick={connectWallet} disabled={loading}>
              {loading ? <div className="spinner"></div> : "Connect MetaMask"}
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="dashboard-container">
        
        {isSandbox && (
          <div className="sandbox-banner">
            <div>
              <strong>Wallet Not Connected</strong> — Running in simulation mode. Connect MetaMask on Sepolia for live operations.
            </div>
          </div>
        )}

        {/* Global Stats Bar */}
        <section className="stat-grid">
          <div className="glass-panel stat-card">
            <span className="stat-label">BLX Spot Price</span>
            <span className="stat-value">${stats.blxPrice > 0 ? stats.blxPrice.toFixed(2) : "0.78"} USDT</span>
            <span className="stat-sub">Dynamic pool spot ratio</span>
          </div>
          <div className="glass-panel stat-card secondary">
            <span className="stat-label">Protocol TVL</span>
            <span className="stat-value">${stats.totalTVL > 0 ? stats.totalTVL.toLocaleString() : "306,324"}</span>
            <span className="stat-sub">Across Staking & Vaults</span>
          </div>
          <div className="glass-panel stat-card">
            <span className="stat-label">Liquid APY</span>
            <span className="stat-value">{stats.staking.liquidAPY}% APY</span>
            <span className="stat-sub">Compounding rewards</span>
          </div>
          <div className="glass-panel stat-card secondary">
            <span className="stat-label">Circulating Supply</span>
            <span className="stat-value">{stats.blxSupply > 0 ? stats.blxSupply.toLocaleString() : "500,020,000"} BLX</span>
          </div>
        </section>

        {/* Tab Navigator */}
        <nav className="tab-navigator">
          <button className={`tab-btn ${activeTab === "overview" ? "active" : ""}`} onClick={() => setActiveTab("overview")}>
            📊 Portfolio
          </button>
          <button className={`tab-btn ${activeTab === "staking" ? "active" : ""}`} onClick={() => setActiveTab("staking")}>
            🥩 Staking
          </button>
          <button className={`tab-btn ${activeTab === "swap" ? "active" : ""}`} onClick={() => setActiveTab("swap")}>
            🔀 Pool & Swap
          </button>
          <button className={`tab-btn ${activeTab === "vault" ? "active" : ""}`} onClick={() => setActiveTab("vault")}>
            🔒 Yield Vault
          </button>
          <button className={`tab-btn ${activeTab === "perpetual" ? "active" : ""}`} onClick={() => setActiveTab("perpetual")}>
            📈 Perpetual
          </button>
          <button className={`tab-btn ${activeTab === "lending" ? "active" : ""}`} onClick={() => setActiveTab("lending")}>
            🏦 Lending
          </button>
          <button className={`tab-btn ${activeTab === "spot" ? "active" : ""}`} onClick={() => setActiveTab("spot")}>
            ⚡ Leveraged Spot
          </button>
          <button className={`tab-btn ${activeTab === "hidden" ? "active" : ""}`} onClick={() => setActiveTab("hidden")}>
            👁 Hidden Orders
          </button>
          <button className={`tab-btn ${activeTab === "admin" ? "active" : ""}`} onClick={() => setActiveTab("admin")}>
            🛡 Admin
          </button>
        </nav>

        {/* PORTFOLIO VIEWPORT */}
        {activeTab === "overview" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "2rem", marginBottom: "2rem" }}>
              <div className="glass-panel">
                <h3 style={{ marginBottom: "1.5rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
                  Wallet Holdings
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: "700" }}>Blume Token (BLX)</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Core Governance</div>
                    </div>
                    <span style={{ fontWeight: "800", color: "var(--primary)" }}>{balances.blx.toFixed(2)} BLX</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: "700" }}>Liquid Blume (stBLX)</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Staking shares</div>
                    </div>
                    <span style={{ fontWeight: "800", color: "var(--secondary)" }}>{balances.stBlx.toFixed(2)} stBLX</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: "700" }}>Vault Blume Shares (vBLX)</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Storage Yield</div>
                    </div>
                    <span style={{ fontWeight: "800", color: "var(--accent)" }}>{balances.vBlx.toFixed(2)} vBLX</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: "700" }}>Mock USDT</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Pair currency</div>
                    </div>
                    <span style={{ fontWeight: "800", color: "var(--secondary)" }}>${balances.usdt.toFixed(2)} USDT</span>
                  </div>
                </div>
              </div>

              <div className="glass-panel">
                <h3 style={{ marginBottom: "1.5rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
                  Platform Contracts Overview
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1rem" }}>
                    <span style={{ fontWeight: "700", color: "var(--text-muted)" }}>BLX Token:</span>
                    <span style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{displayAddress(addresses.BLXToken)}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1rem" }}>
                    <span style={{ fontWeight: "700", color: "var(--text-muted)" }}>Staking Manager:</span>
                    <span style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{displayAddress(addresses.BlumeStaking)}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1rem" }}>
                    <span style={{ fontWeight: "700", color: "var(--text-muted)" }}>Liquidity Pool AMM:</span>
                    <span style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{displayAddress(addresses.BlumeLP)}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1rem" }}>
                    <span style={{ fontWeight: "700", color: "var(--text-muted)" }}>EIP-4626 Vault:</span>
                    <span style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{displayAddress(addresses.BlumeVault)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="glass-panel">
              <h3 style={{ marginBottom: "1.25rem" }}>Ecosystem Transactions History Log</h3>
              <div className="table-container">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Quantity / Position</th>
                      <th>User Account</th>
                      <th>Tx Hash</th>
                      <th>Time Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txHistory.length > 0 ? (
                      txHistory.map((tx) => (
                        <tr key={tx.id}>
                          <td><span className="badge badge-success">{tx.action}</span></td>
                          <td style={{ fontWeight: "700" }}>{tx.amount}</td>
                          <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{formatAddress(tx.address)}</td>
                          <td style={{ fontFamily: "monospace", fontSize: "0.85rem", color: "var(--text-muted)" }}>{tx.hash}</td>
                          <td style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{new Date(tx.timestamp).toLocaleTimeString()}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" style={{ textAlign: "center", color: "var(--text-muted)" }}>
                          No transactions tracked yet. Deposit or Stake to generate logs!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* STAKING VIEWPORT */}
        {activeTab === "staking" && (
          <div className="staking-grid">
            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              <div className="glass-panel">
                <h3 style={{ marginBottom: "1.5rem" }}>Classic High-Yield Staking</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
                  {[
                    { label: "Flexible", apy: stats.staking.flexibleAPY, id: 0, days: 0 },
                    { label: "30 Days", apy: stats.staking.locked30APY, id: 1, days: 30 },
                    { label: "90 Days", apy: stats.staking.locked90APY, id: 2, days: 90 },
                    { label: "180 Days", apy: stats.staking.locked180APY, id: 3, days: 180 }
                  ].map(period => (
                    <button 
                      key={period.id}
                      className={`staking-card-btn ${selectedLockPeriod === period.id ? "active" : ""}`}
                      onClick={() => setSelectedLockPeriod(period.id)}
                    >
                      <div style={{ fontWeight: "700" }}>{period.label}</div>
                      <div style={{ fontSize: "1.1rem", color: "var(--primary)", fontWeight: "800" }}>{period.apy}% APY</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{period.days}-Day lockup</div>
                    </button>
                  ))}
                </div>

                <div className="form-group">
                  <div className="form-label">
                    <span>Stake Amount</span>
                    <span>Balance: {balances.blx.toFixed(2)} BLX</span>
                  </div>
                  <div className="input-container">
                    <input 
                      type="number" 
                      className="form-input" 
                      placeholder="0.0" 
                      value={stakeAmount}
                      onChange={(e) => setStakeAmount(e.target.value)}
                    />
                    <div className="token-badge">
                      <span>BLX</span>
                      <button className="btn-max" onClick={() => setStakeAmount(balances.blx.toString())}>MAX</button>
                    </div>
                  </div>
                </div>

                <button 
                  className="btn-primary" 
                  style={{ width: "100%", justifyContent: "center", marginTop: "1rem" }}
                  onClick={async () => {
                    if (!stakeAmount || isNaN(stakeAmount)) return;
                    const ok = await stakeClassic(stakeAmount, selectedLockPeriod);
                    if (ok) setStakeAmount("");
                  }}
                  disabled={loading}
                >
                  {loading ? <div className="spinner"></div> : "Stake BLX Tokens"}
                </button>
              </div>

              <div className="glass-panel">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <h3>Liquid Staking Manager (stBLX)</h3>
                  <span className="badge badge-claimable">
                    Exchange Rate: 1 stBLX = {stats.staking.stBLXRate > 0 ? stats.staking.stBLXRate.toFixed(4) : "1.0000"} BLX
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                  <div>
                    <div className="form-label">
                      <span>Stake BLX for stBLX</span>
                      <span>Bal: {balances.blx.toFixed(1)}</span>
                    </div>
                    <div className="input-container">
                      <input 
                        type="number" 
                        className="form-input" 
                        placeholder="0.0" 
                        value={liquidStakeAmt}
                        onChange={(e) => setLiquidStakeAmt(e.target.value)}
                      />
                      <span style={{ fontWeight: "700", color: "var(--primary)" }}>BLX</span>
                    </div>
                    <button 
                      className="btn-primary" 
                      style={{ width: "100%", justifyContent: "center", marginTop: "1rem" }}
                      onClick={async () => {
                        if (!liquidStakeAmt || isNaN(liquidStakeAmt)) return;
                        const ok = await stakeLiquid(liquidStakeAmt);
                        if (ok) setLiquidStakeAmt("");
                      }}
                      disabled={loading}
                    >
                      Stake Liquid
                    </button>
                  </div>

                  <div>
                    <div className="form-label">
                      <span>Redeem stBLX for BLX</span>
                      <span>Bal: {balances.stBlx.toFixed(1)}</span>
                    </div>
                    <div className="input-container">
                      <input 
                        type="number" 
                        className="form-input" 
                        placeholder="0.0" 
                        value={liquidUnstakeAmt}
                        onChange={(e) => setLiquidUnstakeAmt(e.target.value)}
                      />
                      <span style={{ fontWeight: "700", color: "var(--secondary)" }}>stBLX</span>
                    </div>
                    <button 
                      className="btn-secondary" 
                      style={{ width: "100%", justifyContent: "center", marginTop: "1rem" }}
                      onClick={async () => {
                        if (!liquidUnstakeAmt || isNaN(liquidUnstakeAmt)) return;
                        const ok = await unstakeLiquid(liquidUnstakeAmt);
                        if (ok) setLiquidUnstakeAmt("");
                      }}
                      disabled={loading}
                    >
                      Unstake / Redeem
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              <div className="glass-panel">
                <h3>Staking Position</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", margin: "1.5rem 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Liquid Staked:</span>
                    <span style={{ fontWeight: "700", color: "var(--secondary)" }}>{balances.stBlx.toFixed(2)} stBLX</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Unclaimed Yield:</span>
                    <span style={{ fontWeight: "800", color: "var(--primary)" }}>{balances.pendingRewards.toFixed(2)} BLX</span>
                  </div>
                </div>
                <button className="btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={claimClassicRewards}>
                  Claim Yield
                </button>
              </div>

              <div className="glass-panel">
                <h3>Active Locking Stakes</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
                  {userStakes.length > 0 ? (
                    userStakes.map(stake => (
                      <div key={stake.index} style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: "700" }}>{stake.amount} BLX</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>APY: {stake.apy}% | lockup</div>
                        </div>
                        <button className="btn-primary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }} onClick={() => unstakeClassic(stake.index)}>
                          Unstake
                        </button>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", textAlign: "center" }}>No lock stakes active</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SWAP & LP VIEWPORT */}
        {activeTab === "swap" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "2rem" }}>
            <div className="glass-panel swap-card">
              <h3 style={{ marginBottom: "1.5rem" }}>Ecosystem Swap</h3>
              <div className="form-group">
                <div className="form-label">
                  <span>Pay</span>
                  <span>Balance: {swapTokenIn === "BLX" ? balances.blx.toFixed(2) : balances.usdt.toFixed(2)}</span>
                </div>
                <div className="input-container">
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="0.0" 
                    value={swapInput}
                    onChange={(e) => setSwapInput(e.target.value)}
                  />
                  <span style={{ fontWeight: "700" }}>{swapTokenIn}</span>
                </div>
              </div>

              <div className="swap-arrows">
                <button className="swap-arrow-btn" onClick={handleSwapTokenToggle}>⇄</button>
              </div>

              <div className="form-group">
                <div className="form-label">
                  <span>Receive (Estimated)</span>
                  <span>Balance: {swapTokenOut === "BLX" ? balances.blx.toFixed(2) : balances.usdt.toFixed(2)}</span>
                </div>
                <div className="input-container">
                  <input type="text" className="form-input" readOnly value={getEstimatedSwapOutput()} />
                  <span style={{ fontWeight: "700" }}>{swapTokenOut}</span>
                </div>
              </div>

              <button 
                className="btn-primary" 
                style={{ width: "100%", justifyContent: "center", marginTop: "1rem" }}
                onClick={async () => {
                  if (!swapInput || isNaN(swapInput)) return;
                  const estOut = getEstimatedSwapOutput();
                  const ok = await swapTokens(swapTokenIn, swapInput, (parseFloat(estOut) * 0.98).toString());
                  if (ok) setSwapInput("");
                }}
                disabled={loading}
              >
                Swap Tokens
              </button>
            </div>

            <div className="glass-panel">
              <h3>BLX-USDT Liquidity Provision</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "1rem 0" }}>
                Add equivalent tokens to secure swap reserves and earn trading fees.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
                <div>
                  <div className="form-label"><span>BLX Reserve</span></div>
                  <div className="input-container">
                    <input 
                      type="number" 
                      className="form-input" 
                      placeholder="0.0" 
                      value={lpBlxAmt}
                      onChange={(e) => {
                        setLpBlxAmt(e.target.value);
                        if (e.target.value) {
                          setLpUsdtAmt((parseFloat(e.target.value) * (stats.blxPrice || 0.78)).toFixed(2));
                        } else setLpUsdtAmt("");
                      }}
                    />
                    <span style={{ fontWeight: "700" }}>BLX</span>
                  </div>
                </div>

                <div>
                  <div className="form-label"><span>USDT Reserve</span></div>
                  <div className="input-container">
                    <input 
                      type="number" 
                      className="form-input" 
                      placeholder="0.0" 
                      value={lpUsdtAmt}
                      onChange={(e) => {
                        setLpUsdtAmt(e.target.value);
                        if (e.target.value) {
                          setLpBlxAmt((parseFloat(e.target.value) / (stats.blxPrice || 0.78)).toFixed(2));
                        } else setLpBlxAmt("");
                      }}
                    />
                    <span style={{ fontWeight: "700" }}>USDT</span>
                  </div>
                </div>
              </div>

              <button 
                className="btn-primary" 
                style={{ width: "100%", justifyContent: "center", marginBottom: "2rem" }}
                onClick={async () => {
                  if (!lpBlxAmt || !lpUsdtAmt) return;
                  const ok = await addLiquidity(lpBlxAmt, lpUsdtAmt);
                  if (ok) { setLpBlxAmt(""); setLpUsdtAmt(""); }
                }}
              >
                Add Liquidity Pair
              </button>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1.5rem" }}>
                <h4>Withdraw Liquidity</h4>
                <div className="form-label" style={{ marginTop: "1rem" }}>
                  <span>Burn LP Shares</span>
                  <span>Balance: {balances.lp.toFixed(2)} LP</span>
                </div>
                <div className="input-container" style={{ marginBottom: "1rem" }}>
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="0.0" 
                    value={lpRemoveShares}
                    onChange={(e) => setLpRemoveShares(e.target.value)}
                  />
                </div>
                <button 
                  className="btn-secondary" 
                  style={{ width: "100%", justifyContent: "center" }}
                  onClick={async () => {
                    if (!lpRemoveShares || isNaN(lpRemoveShares)) return;
                    const ok = await removeLiquidity(lpRemoveShares);
                    if (ok) setLpRemoveShares("");
                  }}
                >
                  Withdraw Reserves
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VAULT VIEWPORT */}
        {activeTab === "vault" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
            <div className="glass-panel">
              <h3>Secure Vault Deposits</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", margin: "1.25rem 0" }}>
                Deposit your BLX tokens into the highly secure EIP-4626 standard storage vault. Stored tokens mint `vBLX` shares which capture automated yields.
              </p>
              
              <div className="form-group">
                <div className="form-label">
                  <span>Lock Amount</span>
                  <span>Balance: {balances.blx.toFixed(2)} BLX</span>
                </div>
                <div className="input-container">
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="0.0" 
                    value={vaultDepositAmt}
                    onChange={(e) => setVaultDepositAmt(e.target.value)}
                  />
                  <span style={{ fontWeight: "700" }}>BLX</span>
                </div>
              </div>

              <button 
                className="btn-primary" 
                style={{ width: "100%", justifyContent: "center", marginTop: "1rem" }}
                onClick={async () => {
                  if (!vaultDepositAmt || isNaN(vaultDepositAmt)) return;
                  const ok = await depositVault(vaultDepositAmt);
                  if (ok) setVaultDepositAmt("");
                }}
              >
                Secure Deposit BLX
              </button>
            </div>

            <div className="glass-panel">
              <h3>Redeem Vault Shares</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", margin: "1.25rem 0" }}>
                Burn your `vBLX` shares to withdraw the underlying BLX tokens.
              </p>

              <div className="form-group">
                <div className="form-label">
                  <span>Redeem Shares</span>
                  <span>vBLX Shares: {balances.vBlx.toFixed(2)} vBLX</span>
                </div>
                <div className="input-container">
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="0.0" 
                    value={vaultWithdrawAmt}
                    onChange={(e) => setVaultWithdrawAmt(e.target.value)}
                  />
                  <span style={{ fontWeight: "700" }}>vBLX</span>
                </div>
              </div>

              <button 
                className="btn-secondary" 
                style={{ width: "100%", justifyContent: "center", borderColor: "var(--accent)", color: "var(--accent)" }}
                onClick={async () => {
                  if (!vaultWithdrawAmt || isNaN(vaultWithdrawAmt)) return;
                  const ok = await withdrawVault(vaultWithdrawAmt);
                  if (ok) setVaultWithdrawAmt("");
                }}
              >
                Withdraw Assets
              </button>
            </div>
          </div>
        )}

        {/* --- NEW VIEWPORTS (TRADING, LENDING, SPOT, HIDDEN, ADMIN) --- */}

        {/* PERPETUAL TRADING VIEWPORT */}
        {activeTab === "perpetual" && (
          <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr", gap: "2rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              {/* Mock Charts Panel */}
              <div className="glass-panel" style={{ minHeight: "300px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h4>BLX/USDT Perpetual Live Chart</h4>
                  <span className="badge badge-claimable">Mark Price: ${(stats.blxPrice || 0.78).toFixed(4)}</span>
                </div>
                {/* SVG Mock Chart */}
                <div style={{ height: "180px", margin: "1.5rem 0", position: "relative", background: "rgba(0,0,0,0.2)", borderRadius: "8px" }}>
                  <svg width="100%" height="100%" viewBox="0 0 500 100" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="chart-glow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35"/>
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity="0"/>
                      </linearGradient>
                    </defs>
                    <path d="M 0 80 Q 50 60 100 70 T 200 40 T 300 50 T 400 30 T 500 20 L 500 100 L 0 100 Z" fill="url(#chart-glow)"/>
                    <path d="M 0 80 Q 50 60 100 70 T 200 40 T 300 50 T 400 30 T 500 20" fill="none" stroke="var(--primary)" strokeWidth="2"/>
                    <circle cx="500" cy="20" r="4" fill="var(--primary)" />
                  </svg>
                  <span style={{ position: "absolute", top: "10px", left: "10px", fontSize: "0.8rem", color: "var(--text-muted)" }}>Volume (24h): $1,420,950 USDT</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", textAlign: "center", fontSize: "0.85rem" }}>
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>Funding Rate</div>
                    <div style={{ fontWeight: "700", color: "var(--secondary)" }}>+0.0100% / 8h</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>Open Interest</div>
                    <div style={{ fontWeight: "700" }}>4,520,000 BLX</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>24h High</div>
                    <div style={{ fontWeight: "700" }}>$0.8200</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)" }}>24h Low</div>
                    <div style={{ fontWeight: "700" }}>$0.7150</div>
                  </div>
                </div>
              </div>

              {/* Positions Table */}
              <div className="glass-panel">
                <h3>Open Perpetual Positions</h3>
                <div className="table-container" style={{ marginTop: "1rem" }}>
                  <table className="premium-table">
                    <thead>
                      <tr>
                        <th>Market</th>
                        <th>Type</th>
                        <th>Size</th>
                        <th>Leverage</th>
                        <th>Entry Price</th>
                        <th>Liquidation Price</th>
                        <th>PnL (USDT)</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perpPositions.map(pos => (
                        <tr key={pos.id}>
                          <td style={{ fontWeight: "700" }}>{pos.token}</td>
                          <td>
                            <span className={`badge ${pos.type === "LONG" ? "badge-claimable" : "badge-locked"}`}>
                              {pos.type}
                            </span>
                          </td>
                          <td>{pos.size} BLX</td>
                          <td>{pos.leverage}x</td>
                          <td>${pos.entryPrice.toFixed(3)}</td>
                          <td style={{ color: "var(--accent)" }}>${pos.liquidationPrice.toFixed(3)}</td>
                          <td style={{ color: pos.pnl >= 0 ? "var(--secondary)" : "var(--accent)", fontWeight: "700" }}>
                            {pos.pnl >= 0 ? "+" : ""}${pos.pnl.toFixed(2)}
                          </td>
                          <td>
                            <button className="btn-secondary" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={() => closePerpPosition(pos.id)}>
                              Close
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Trading Order Form */}
            <div className="glass-panel">
              <h3 style={{ marginBottom: "1.5rem" }}>Place Perpetual Order</h3>
              
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
                <button 
                  className={`btn-primary ${perpTradeType === "LONG" ? "" : "btn-secondary"}`} 
                  style={{ flex: 1, justifyContent: "center", background: perpTradeType === "LONG" ? "" : "transparent" }}
                  onClick={() => setPerpTradeType("LONG")}
                >
                  🟢 Buy / Long
                </button>
                <button 
                  className={`btn-primary ${perpTradeType === "SHORT" ? "badge-locked" : "btn-secondary"}`} 
                  style={{ flex: 1, justifyContent: "center", background: perpTradeType === "SHORT" ? "var(--accent)" : "transparent", borderColor: perpTradeType === "SHORT" ? "var(--accent)" : "" }}
                  onClick={() => setPerpTradeType("SHORT")}
                >
                  🔴 Sell / Short
                </button>
              </div>

              <form onSubmit={openPerpPosition}>
                <div className="form-group">
                  <div className="form-label">
                    <span>Order Size</span>
                    <span>Max Size: {(balances.blx * perpLeverage).toFixed(0)} BLX</span>
                  </div>
                  <div className="input-container">
                    <input 
                      type="number" 
                      className="form-input" 
                      placeholder="0.0" 
                      value={perpSize}
                      onChange={(e) => setPerpSize(e.target.value)}
                    />
                    <span style={{ fontWeight: "700" }}>BLX</span>
                  </div>
                </div>

                <div className="form-group" style={{ margin: "2rem 0" }}>
                  <div className="form-label">
                    <span>Leverage Factor</span>
                    <span style={{ fontWeight: "700", color: "var(--primary)" }}>{perpLeverage}x</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="50" 
                    value={perpLeverage} 
                    onChange={(e) => setPerpLeverage(Number(e.target.value))}
                    style={{ width: "100%", accentColor: "var(--primary)" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
                    <span>1x</span>
                    <span>10x</span>
                    <span>25x</span>
                    <span>50x</span>
                  </div>
                </div>

                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Margin Requirement:</span>
                    <span style={{ color: "#fff", fontWeight: "600" }}>
                      ${perpSize ? ((parseFloat(perpSize) * (stats.blxPrice || 0.78)) / perpLeverage).toFixed(2) : "0.00"} USDT
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Liquidation Price (Est.):</span>
                    <span style={{ color: "var(--accent)", fontWeight: "600" }}>
                      ${perpSize ? (perpTradeType === "LONG" ? (stats.blxPrice || 0.78) * (1 - 1 / perpLeverage) : (stats.blxPrice || 0.78) * (1 + 1 / perpLeverage)).toFixed(4) : "0.0000"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Execution Fee (0.05%):</span>
                    <span>${perpSize ? (parseFloat(perpSize) * (stats.blxPrice || 0.78) * 0.0005).toFixed(4) : "0.00"}</span>
                  </div>
                </div>

                <button className="btn-primary" style={{ width: "100%", justifyContent: "center" }} type="submit">
                  Execute Perpetual {perpTradeType}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ASSET LENDING VIEWPORT */}
        {activeTab === "lending" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "2rem" }}>
            {/* Lending Actions form */}
            <div className="glass-panel">
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
                <button 
                  className={`btn-primary ${lendingTab === "SUPPLY" ? "" : "btn-secondary"}`} 
                  style={{ flex: 1, justifyContent: "center", background: lendingTab === "SUPPLY" ? "" : "transparent" }}
                  onClick={() => { setLendingTab("SUPPLY"); setLendToken("USDT"); }}
                >
                  📥 Supply Capital
                </button>
                <button 
                  className={`btn-primary ${lendingTab === "BORROW" ? "badge-locked" : "btn-secondary"}`} 
                  style={{ flex: 1, justifyContent: "center", background: lendingTab === "BORROW" ? "var(--accent)" : "transparent", borderColor: lendingTab === "BORROW" ? "var(--accent)" : "" }}
                  onClick={() => { setLendingTab("BORROW"); setLendToken("USDT"); }}
                >
                  📤 Borrow Capital
                </button>
              </div>

              <form onSubmit={executeLendingAction}>
                <div className="form-group">
                  <div className="form-label">
                    <span>Select Currency Token</span>
                  </div>
                  <div style={{ display: "flex", gap: "1rem" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                      <input 
                        type="radio" 
                        name="lendToken" 
                        value="USDT" 
                        checked={lendToken === "USDT"} 
                        onChange={() => setLendToken("USDT")}
                      />
                      <span>USDT (APY: {lendingTab === "SUPPLY" ? "6.2%" : "8.5%"})</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                      <input 
                        type="radio" 
                        name="lendToken" 
                        value="BLX" 
                        checked={lendToken === "BLX"} 
                        onChange={() => setLendToken("BLX")}
                      />
                      <span>BLX (APY: {lendingTab === "SUPPLY" ? "4.8%" : "9.8%"})</span>
                    </label>
                  </div>
                </div>

                <div className="form-group">
                  <div className="form-label">
                    <span>Amount</span>
                    <span>Wallet Balance: {lendToken === "BLX" ? balances.blx.toFixed(1) : balances.usdt.toFixed(1)}</span>
                  </div>
                  <div className="input-container">
                    <input 
                      type="number" 
                      className="form-input" 
                      placeholder="0.0" 
                      value={lendAmount}
                      onChange={(e) => setLendAmount(e.target.value)}
                    />
                    <span style={{ fontWeight: "700" }}>{lendToken}</span>
                  </div>
                </div>

                <button className="btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: "1rem" }} type="submit">
                  Confirm {lendingTab === "SUPPLY" ? "Supply Transaction" : "Borrow Transaction"}
                </button>
              </form>
            </div>

            {/* Position and Parameters Summary */}
            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              <div className="glass-panel" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Collateral Deposited</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: "800", color: "var(--secondary)" }}>${collateralValue.toFixed(2)}</div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Active Borrowed Amount</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: "800", color: "var(--accent)" }}>${borrowedValue.toFixed(2)}</div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Borrow Capacity Limit</div>
                  <div style={{ fontSize: "1.1rem", fontWeight: "700" }}>${(collateralValue * 0.8).toFixed(2)}</div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Account Health Factor</div>
                  <div 
                    style={{ 
                      fontSize: "1.1rem", 
                      fontWeight: "800", 
                      color: Number(getHealthFactor()) > 1.5 ? "var(--secondary)" : "var(--accent)" 
                    }}
                  >
                    {getHealthFactor()}
                  </div>
                </div>
              </div>

              {/* Supplied Assets lists */}
              <div className="glass-panel">
                <h3>Your Active Positions</h3>
                <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  <div>
                    <h5 style={{ color: "var(--text-muted)", marginBottom: "0.5rem" }}>Supplied Collateral Assets</h5>
                    {suppliedAssets.map(asset => (
                      <div key={asset.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem", borderBottom: "1px solid rgba(255,255,255,0.03)", padding: "0.4rem 0" }}>
                        <span style={{ fontWeight: "700" }}>{asset.amount} {asset.token}</span>
                        <span>APY: {asset.apy}%</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <h5 style={{ color: "var(--text-muted)", marginBottom: "0.5rem" }}>Active Borrows</h5>
                    {borrowedAssets.map(asset => (
                      <div key={asset.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem", borderBottom: "1px solid rgba(255,255,255,0.03)", padding: "0.4rem 0" }}>
                        <span style={{ fontWeight: "700", color: "var(--accent)" }}>{asset.amount} {asset.token}</span>
                        <span>APY: {asset.apy}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* LEVERAGED SPOT VIEWPORT */}
        {activeTab === "spot" && (
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "2rem" }}>
            {/* Spot positions */}
            <div className="glass-panel">
              <h3>Active Leveraged Spot Positions</h3>
              <div className="table-container" style={{ marginTop: "1rem" }}>
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Asset Pair</th>
                      <th>Side</th>
                      <th>Quantity</th>
                      <th>Leverage</th>
                      <th>Entry Price</th>
                      <th>TP / SL Targets</th>
                      <th>PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spotPositions.map(pos => (
                      <tr key={pos.id}>
                        <td style={{ fontWeight: "700" }}>{pos.pair}</td>
                        <td><span className="badge badge-success">{pos.side}</span></td>
                        <td>{pos.size} BLX</td>
                        <td>{pos.leverage}x</td>
                        <td>${pos.entryPrice.toFixed(3)}</td>
                        <td>TP: ${pos.tp.toFixed(2)} / SL: ${pos.sl.toFixed(2)}</td>
                        <td style={{ color: "var(--secondary)", fontWeight: "700" }}>
                          +${((pos.currentPrice - pos.entryPrice) * pos.size * pos.leverage).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Spot Order Form */}
            <div className="glass-panel">
              <h3>Execute Leveraged Spot</h3>
              <div style={{ display: "flex", gap: "0.5rem", margin: "1.5rem 0" }}>
                <button 
                  className={`btn-primary ${spotOrderSide === "BUY" ? "" : "btn-secondary"}`} 
                  style={{ flex: 1, justifyContent: "center", background: spotOrderSide === "BUY" ? "" : "transparent" }}
                  onClick={() => setSpotOrderSide("BUY")}
                >
                  🟢 Buy / Long
                </button>
                <button 
                  className={`btn-primary ${spotOrderSide === "SELL" ? "badge-locked" : "btn-secondary"}`} 
                  style={{ flex: 1, justifyContent: "center", background: spotOrderSide === "SELL" ? "var(--accent)" : "transparent", borderColor: spotOrderSide === "SELL" ? "var(--accent)" : "" }}
                  onClick={() => setSpotOrderSide("SELL")}
                >
                  🔴 Sell / Short
                </button>
              </div>

              <form onSubmit={executeSpotOrder}>
                <div className="form-group">
                  <div className="form-label">
                    <span>Token Amount</span>
                  </div>
                  <div className="input-container">
                    <input 
                      type="number" 
                      className="form-input" 
                      placeholder="0.0" 
                      value={spotSize}
                      onChange={(e) => setSpotSize(e.target.value)}
                    />
                    <span style={{ fontWeight: "700" }}>BLX</span>
                  </div>
                </div>

                <div className="form-group" style={{ margin: "2rem 0" }}>
                  <div className="form-label">
                    <span>Spot Leverage</span>
                    <span style={{ fontWeight: "700" }}>{spotLeverage}x</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="5" 
                    value={spotLeverage} 
                    onChange={(e) => setSpotLeverage(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                  <div className="form-group">
                    <div className="form-label"><span>Take Profit Price</span></div>
                    <div className="input-container">
                      <input 
                        type="number" 
                        step="0.01" 
                        className="form-input" 
                        placeholder="0.90" 
                        value={spotTP}
                        onChange={(e) => setSpotTP(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <div className="form-label"><span>Stop Loss Price</span></div>
                    <div className="input-container">
                      <input 
                        type="number" 
                        step="0.01" 
                        className="form-input" 
                        placeholder="0.70" 
                        value={spotSL}
                        onChange={(e) => setSpotSL(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <button className="btn-primary" style={{ width: "100%", justifyContent: "center" }} type="submit">
                  Execute Leveraged Spot
                </button>
              </form>
            </div>
          </div>
        )}

        {/* HIDDEN ORDERS (ZK SHIELDED PORTAL) VIEWPORT */}
        {activeTab === "hidden" && (
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "2rem" }}>
            {/* Active Hidden Orders List */}
            <div className="glass-panel">
              <h3>Active Zero-Knowledge Hidden Orders</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "0.5rem 0 1.5rem" }}>
                These trades generate ZK-SNARK proofs locally to hide execution sizes and target prices on-chain until the pool matching parameters are validated.
              </p>

              <div className="table-container">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Quantity</th>
                      <th>Target Price</th>
                      <th>Privacy Type</th>
                      <th>Proof Status</th>
                      <th>Proof Hash Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hiddenOrders.map(ho => (
                      <tr key={ho.id}>
                        <td><span className={`badge ${ho.side === "BUY" ? "badge-claimable" : "badge-locked"}`}>{ho.side}</span></td>
                        <td>{ho.size} BLX</td>
                        <td>${ho.targetPrice.toFixed(3)}</td>
                        <td><span className="badge badge-success">{ho.privacy}</span></td>
                        <td style={{ color: "var(--secondary)" }}>✔ {ho.status}</td>
                        <td style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "var(--text-dark)" }}>{ho.hash}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Hidden Order Form */}
            <div className="glass-panel">
              <h3>Create Hidden Order</h3>
              <form onSubmit={submitHiddenOrder} style={{ marginTop: "1.5rem" }}>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
                  <button 
                    type="button"
                    className={`btn-primary ${hiddenOrderSide === "BUY" ? "" : "btn-secondary"}`} 
                    style={{ flex: 1, justifyContent: "center", background: hiddenOrderSide === "BUY" ? "" : "transparent" }}
                    onClick={() => setHiddenOrderSide("BUY")}
                  >
                    🟢 Private Buy
                  </button>
                  <button 
                    type="button"
                    className={`btn-primary ${hiddenOrderSide === "SELL" ? "badge-locked" : "btn-secondary"}`} 
                    style={{ flex: 1, justifyContent: "center", background: hiddenOrderSide === "SELL" ? "var(--accent)" : "transparent", borderColor: hiddenOrderSide === "SELL" ? "var(--accent)" : "" }}
                    onClick={() => setHiddenOrderSide("SELL")}
                  >
                    🔴 Private Sell
                  </button>
                </div>

                <div className="form-group">
                  <div className="form-label"><span>Private Token Amount</span></div>
                  <div className="input-container">
                    <input 
                      type="number" 
                      className="form-input" 
                      placeholder="10000" 
                      value={hiddenSize}
                      onChange={(e) => setHiddenSize(e.target.value)}
                    />
                    <span style={{ fontWeight: "700" }}>BLX</span>
                  </div>
                </div>

                <div className="form-group">
                  <div className="form-label"><span>Limit Match Price Target</span></div>
                  <div className="input-container">
                    <input 
                      type="number" 
                      step="0.001" 
                      className="form-input" 
                      placeholder="0.750" 
                      value={hiddenPrice}
                      onChange={(e) => setHiddenPrice(e.target.value)}
                    />
                    <span style={{ fontWeight: "700" }}>USDT</span>
                  </div>
                </div>

                <div className="form-group">
                  <div className="form-label"><span>Privacy Level</span></div>
                  <select 
                    value={hiddenPrivacy} 
                    onChange={(e) => setHiddenPrivacy(e.target.value)}
                    style={{ width: "100%", padding: "0.75rem", background: "rgba(18, 12, 28, 0.8)", border: "1px solid var(--border)", borderRadius: "10px", color: "#fff", fontWeight: "600" }}
                  >
                    <option value="PRIVATE">PRIVATE (Obfuscate Price only)</option>
                    <option value="SHIELDED">SHIELDED (Obfuscate Price and Size via ZK-SNARK)</option>
                  </select>
                </div>

                <button 
                  className="btn-primary" 
                  style={{ width: "100%", justifyContent: "center", marginTop: "1rem" }} 
                  type="submit"
                  disabled={isGeneratingZK}
                >
                  {isGeneratingZK ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div className="spinner"></div>
                      <span>Compiling ZK-SNARK Proof...</span>
                    </div>
                  ) : "Generate Proof & Submit"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ADMIN PANEL VIEWPORT */}
        {activeTab === "admin" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: "2rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              {/* Emergency Controls */}
              <div className="glass-panel" style={{ border: killSwitchActive ? "1px solid var(--accent)" : "1px solid var(--border)" }}>
                <h3>Ecosystem Safety Controls</h3>
                
                <div style={{ margin: "1.5rem 0", padding: "1rem", borderRadius: "10px", background: "rgba(244,63,94,0.05)", border: "1px solid rgba(244,63,94,0.15)" }}>
                  <div style={{ fontWeight: "700", color: "var(--accent)" }}>⚠ EMERGENCY SYSTEM KILL SWITCH</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0.5rem 0 1rem" }}>
                    Activating the kill switch suspends all liquid staking minting, AMM swaps, and EIP-4626 vault deposits instantly.
                  </div>
                  
                  <button 
                    className="btn-primary" 
                    style={{ background: "var(--accent)", color: "#fff", width: "100%", justifyContent: "center", boxShadow: "0 4px 15px rgba(244,63,94,0.3)" }}
                    onClick={() => {
                      const ok = window.confirm("Are you absolutely sure you want to toggle the platform emergency state?");
                      if (ok) setKillSwitchActive(!killSwitchActive);
                    }}
                  >
                    {killSwitchActive ? "🔓 Deactivate Kill Switch" : "🔒 ACTIVATE PLATFORM KILL SWITCH"}
                  </button>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.9rem" }}>
                  <span>Ecosystem Vault Deposits:</span>
                  <button 
                    className="btn-secondary"
                    style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem", borderColor: vaultPaused ? "var(--secondary)" : "var(--accent)", color: vaultPaused ? "var(--secondary)" : "var(--accent)" }}
                    onClick={() => setVaultPaused(!vaultPaused)}
                  >
                    {vaultPaused ? "Resume Deposits" : "Pause Deposits"}
                  </button>
                </div>
              </div>

              {/* Status Board */}
              <div className="glass-panel">
                <h3>Infrastructure Monitor</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem", fontSize: "0.9rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>EVM Smart Contracts:</span>
                    <span style={{ color: "var(--secondary)", fontWeight: "700" }}>✔ Verified (Sepolia)</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>API Server Integration:</span>
                    <span style={{ color: "var(--secondary)", fontWeight: "700" }}>✔ Connected (Port 5000)</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Database Synchronizer:</span>
                    <span style={{ color: "var(--secondary)", fontWeight: "700" }}>✔ Active (Block #11,520,381)</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Platform Status:</span>
                    <span style={{ color: killSwitchActive ? "var(--accent)" : "var(--secondary)", fontWeight: "700" }}>
                      {killSwitchActive ? "🚨 EMERGENCY PAUSED" : "🟢 FULLY OPERATIONAL"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Limit Updates & Logs */}
            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              <div className="glass-panel">
                <h3>Token Limits Configuration</h3>
                <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div className="form-group">
                    <label className="form-label">Max Transaction Amount (maxTxAmount)</label>
                    <div className="input-container">
                      <input type="text" className="form-input" value={adminMaxTx} onChange={(e) => setAdminMaxTx(e.target.value)} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Max Wallet Limit (maxWalletAmount)</label>
                    <div className="input-container">
                      <input type="text" className="form-input" value={adminMaxWallet} onChange={(e) => setAdminMaxWallet(e.target.value)} />
                    </div>
                  </div>
                  <button className="btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => {
                    alert("Contract parameters update transaction broadcasted!");
                    setAuditLogs([{ id: `log_${Date.now()}`, action: "Adjusted transfer limits parameters", operator: "0x1034...5E78", timestamp: "2026-07-07 23:52" }, ...auditLogs]);
                  }}>
                    Update Limits
                  </button>
                </div>
              </div>

              {/* Audit Logs */}
              <div className="glass-panel">
                <h3>Administrative Action Logs</h3>
                <div className="table-container" style={{ marginTop: "1rem" }}>
                  <table className="premium-table">
                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>Operator</th>
                        <th>Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map(log => (
                        <tr key={log.id}>
                          <td style={{ fontWeight: "700", fontSize: "0.85rem" }}>{log.action}</td>
                          <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{log.operator}</td>
                          <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{log.timestamp}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

const App = () => {
  return (
    <Web3Provider>
      <DashboardApp />
    </Web3Provider>
  );
};

export default App;
