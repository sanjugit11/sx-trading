import React, { createContext, useContext, useState, useEffect } from "react";
import { ethers } from "ethers";
import deployedAddresses from "../../../Deployment_Details.json"

const Web3Context = createContext();

const CONFIGURED_ADDRESSES = {
  BLXToken:  deployedAddresses.BLXToken || "",
  stBLXToken:  deployedAddresses.stBLXToken || "",
  BlumeStaking:  deployedAddresses.BlumeStaking || "",
  MockUSDT: deployedAddresses.MockUSDT || "",
  MockOracle:  deployedAddresses.MockOracle || "",
  BlumeLP: deployedAddresses.BlumeLP || "",
  BlumeVault: deployedAddresses.BlumeVault || ""
};

const EMPTY_STATS = {
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
};

const EMPTY_BALANCES = {
  blx: 0,
  stBlx: 0,
  vBlx: 0,
  lp: 0,
  usdt: 0,
  pendingRewards: 0
};

const LOCK_LABELS = ["Flexible", "30 Days Lock", "90 Days Lock", "180 Days Lock"];
const LOCK_APYS = [5, 10, 18, 28];

const normalizeAddresses = (nextAddresses = {}) => {
  // Start with configured (local) addresses and only override
  // with values that are non-empty in nextAddresses.
  const merged = { ...CONFIGURED_ADDRESSES };
  Object.keys(nextAddresses || {}).forEach((k) => {
    const v = nextAddresses[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      merged[k] = v;
    }
  });
  return merged;
};

export const Web3Provider = ({ children }) => {
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [chainId, setChainId] = useState(null);
  const [networkName, setNetworkName] = useState("");
  const [isSandbox, setIsSandbox] = useState(true);
  const [loading, setLoading] = useState(false);
  const [backendMode, setBackendMode] = useState("node");
  const [addresses, setAddresses] = useState(CONFIGURED_ADDRESSES);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [balances, setBalances] = useState(EMPTY_BALANCES);
  const [userStakes, setUserStakes] = useState([]);
  const [txHistory, setTxHistory] = useState([]);

  const getBackendUrl = () => {
    return backendMode === "node" ? "http://localhost:5000/api" : "http://localhost:8000/api";
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${getBackendUrl()}/stats`);
      if (!res.ok) return null;
      const data = await res.json();
      if (data.addresses) {
        data.addresses = normalizeAddresses(data.addresses);
        setAddresses(data.addresses);
      }
      if (data.stats) setStats(data.stats);
      return data;
    } catch (err) {
      console.warn("Backend API offline. Live contract data will load after the API starts:", err);
      return null;
    }
  };

  useEffect(() => {
    fetchStats();
  }, [backendMode]);

  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = async (accounts) => {
      if (!accounts || accounts.length === 0) {
        disconnectWallet();
        return;
      }

      setWalletAddress(accounts[0]);
      setWalletConnected(true);
      setIsSandbox(false);
      await refreshLiveData(accounts[0]);
    };

    const handleChainChanged = () => {
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [addresses]);

  const requireWallet = async () => {
    if (!window.ethereum) {
      alert("MetaMask extension not found. Please install MetaMask to use the live flow.");
      return null;
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    return { provider, signer, account: await signer.getAddress() };
  };

  const getContracts = async (addressMap = addresses, withSigner = true) => {
    const wallet = withSigner ? await requireWallet() : null;
    if (withSigner && !wallet) return null;

    const runner = withSigner ? wallet.signer : new ethers.BrowserProvider(window.ethereum);
    const [
      BLXTokenArtifact,
      StBLXTokenArtifact,
      MockUSDTArtifact,
      StakingArtifact,
      LPArtifact,
      VaultArtifact
    ] = await Promise.all([
      import("../../../blockchain/artifacts/contracts/BLXToken.sol/BLXToken.json"),
      import("../../../blockchain/artifacts/contracts/stBLXToken.sol/stBLXToken.json"),
      import("../../../blockchain/artifacts/contracts/MockUSDT.sol/MockUSDT.json"),
      import("../../../blockchain/artifacts/contracts/BlumeStaking.sol/BlumeStaking.json"),
      import("../../../blockchain/artifacts/contracts/BlumeLP.sol/BlumeLP.json"),
      import("../../../blockchain/artifacts/contracts/BlumeVault.sol/BlumeVault.json")
    ]);

    const missing = [
      ["BLXToken", addressMap.BLXToken],
      ["stBLXToken", addressMap.stBLXToken],
      ["MockUSDT", addressMap.MockUSDT],
      ["BlumeStaking", addressMap.BlumeStaking],
      ["BlumeLP", addressMap.BlumeLP],
      ["BlumeVault", addressMap.BlumeVault]
    ].filter(([, value]) => !value || String(value).trim() === "");

    if (missing.length > 0) {
      console.warn("Missing contract addresses detected", addressMap, missing.map(([k]) => k));
      alert(`Missing contract address config: ${missing.map(([key]) => key).join(", ")}.\nCheck Deployment_Details.json or backend /stats response.`);
      return null;
    }

    return {
      wallet,
      blx: new ethers.Contract(addressMap.BLXToken, BLXTokenArtifact.abi, runner),
      stBlx: new ethers.Contract(addressMap.stBLXToken, StBLXTokenArtifact.abi, runner),
      usdt: new ethers.Contract(addressMap.MockUSDT, MockUSDTArtifact.abi, runner),
      staking: new ethers.Contract(addressMap.BlumeStaking, StakingArtifact.abi, runner),
      lp: new ethers.Contract(addressMap.BlumeLP, LPArtifact.abi, runner),
      vault: new ethers.Contract(addressMap.BlumeVault, VaultArtifact.abi, runner)
    };
  };

  const approveIfNeeded = async (token, owner, spender, amount) => {
    const allowance = await token.allowance(owner, spender);
    if (allowance >= amount) return;
    const tx = await token.approve(spender, amount);
    await tx.wait();
  };

  const refreshLiveData = async (account = walletAddress, addressMap = addresses) => {
    const latest = await fetchStats();
    const nextAddresses = latest?.addresses || addressMap;
    if (account) {
      await fetchBalances(account, nextAddresses);
      await fetchUserStakes(account, nextAddresses);
    }
  };

  const logTx = async (hash, address, action, amount) => {
    const newTx = {
      id: "tx_" + Date.now(),
      hash,
      address,
      action,
      amount,
      timestamp: Date.now()
    };

    setTxHistory(prev => [newTx, ...prev]);

    try {
      await fetch(`${getBackendUrl()}/tx/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash, address, action, amount })
      });
    } catch (err) {
      console.warn("Could not sync transaction to backend server:", err);
    }
  };

  const connectWallet = async () => {
    setLoading(true);
    try {
      if (!window.ethereum) {
        alert("MetaMask extension not found. Please install MetaMask to connect your wallet.");
        return;
      }

      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!accounts || accounts.length === 0) {
        alert("No accounts found. Please ensure your wallet is unlocked and try again.");
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      const latest = await fetchStats();
      
      const chainIdNum = Number(network.chainId);
      let resolvedName = network.name;
      if (chainIdNum === 11155111) {
        resolvedName = "sepolia";
      } else if (chainIdNum === 31337) {
        resolvedName = "hardhat";
      } else if (resolvedName === "unknown") {
        resolvedName = `chain-${chainIdNum}`;
      }
      
      console.log("network.name==>", resolvedName);
      setWalletConnected(true);
      setWalletAddress(accounts[0]);
      setChainId(chainIdNum);
      setNetworkName(resolvedName);
      setIsSandbox(false);

      const activeAddresses = normalizeAddresses(latest?.addresses || addresses);
      setAddresses(activeAddresses);

      await fetchBalances(accounts[0], activeAddresses);
      await fetchUserStakes(accounts[0], activeAddresses);
    } catch (err) {
      console.error("Error connecting wallet:", err);
      alert("Failed to connect wallet. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const disconnectWallet = () => {
    setWalletConnected(false);
    setWalletAddress("");
    setChainId(null);
    setNetworkName("");
    setIsSandbox(true);
    setBalances(EMPTY_BALANCES);
    setUserStakes([]);
  };

  const faucetUSDT = async () => {
    setLoading(true);
    try {
      const contracts = await getContracts();
      if (!contracts) return false;
      const amount = ethers.parseUnits("1000", 6);
      const tx = await contracts.usdt.mint(contracts.wallet.account, amount);
      await tx.wait();
      await refreshLiveData(contracts.wallet.account);
      await logTx(tx.hash, contracts.wallet.account, "Claim Faucet", "+1000 USDT");
      return true;
    } catch (err) {
      console.error("Faucet failed:", err);
      alert(err.shortMessage || err.message || "Faucet transaction failed.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const swapTokens = async (tokenIn, amountIn, minAmountOut) => {
    setLoading(true);
    try {
      const contracts = await getContracts();
      if (!contracts) return false;

      const isBlxIn = tokenIn === "BLX";
      const inputToken = isBlxIn ? contracts.blx : contracts.usdt;
      const tokenInAddress = isBlxIn ? addresses.BLXToken : addresses.MockUSDT;
      const inputAmount = isBlxIn ? ethers.parseEther(amountIn) : ethers.parseUnits(amountIn, 6);
      const minimumOut = isBlxIn ? ethers.parseUnits(minAmountOut, 6) : ethers.parseEther(minAmountOut);

      await approveIfNeeded(inputToken, contracts.wallet.account, addresses.BlumeLP, inputAmount);
      const tx = await contracts.lp.swap(tokenInAddress, inputAmount, minimumOut);
      await tx.wait();

      await refreshLiveData(contracts.wallet.account);
      await logTx(tx.hash, contracts.wallet.account, `Swap ${tokenIn}`, `${amountIn} ${tokenIn}`);
      return true;
    } catch (err) {
      console.error("Swap failed:", err);
      alert(err.shortMessage || err.message || "Swap failed.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const addLiquidity = async (blxAmount, usdtAmount) => {
    setLoading(true);
    try {
      const contracts = await getContracts();
      if (!contracts) return false;

      const blx = ethers.parseEther(blxAmount);
      const usdt = ethers.parseUnits(usdtAmount, 6);

      await approveIfNeeded(contracts.blx, contracts.wallet.account, addresses.BlumeLP, blx);
      await approveIfNeeded(contracts.usdt, contracts.wallet.account, addresses.BlumeLP, usdt);
      const tx = await contracts.lp.addLiquidity(blx, usdt);
      await tx.wait();

      await refreshLiveData(contracts.wallet.account);
      await logTx(tx.hash, contracts.wallet.account, "Add Liquidity", `+${blxAmount} BLX / +${usdtAmount} USDT`);
      return true;
    } catch (err) {
      console.error("Add liquidity failed:", err);
      alert(err.shortMessage || err.message || "Add liquidity failed.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const removeLiquidity = async (lpShares) => {
    setLoading(true);
    try {
      const contracts = await getContracts();
      if (!contracts) return false;

      const shares = ethers.parseEther(lpShares);
      const tx = await contracts.lp.removeLiquidity(shares);
      await tx.wait();

      await refreshLiveData(contracts.wallet.account);
      await logTx(tx.hash, contracts.wallet.account, "Remove Liquidity", `Burn ${lpShares} LP shares`);
      return true;
    } catch (err) {
      console.error("Remove liquidity failed:", err);
      alert(err.shortMessage || err.message || "Remove liquidity failed.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const stakeClassic = async (amount, lockPeriodId) => {
    setLoading(true);
    try {
      const contracts = await getContracts();
      if (!contracts) return false;

      const parsed = ethers.parseEther(amount);
      await approveIfNeeded(contracts.blx, contracts.wallet.account, addresses.BlumeStaking, parsed);
      const tx = await contracts.staking.stakeClassic(parsed, lockPeriodId);
      await tx.wait();

      await refreshLiveData(contracts.wallet.account);
      await logTx(tx.hash, contracts.wallet.account, "Classic Stake", `${amount} BLX (${LOCK_LABELS[lockPeriodId]})`);
      return true;
    } catch (err) {
      console.error("Classic stake failed:", err);
      alert(err.shortMessage || err.message || "Classic stake failed.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const unstakeClassic = async (index) => {
    setLoading(true);
    try {
      const contracts = await getContracts();
      if (!contracts) return false;

      const tx = await contracts.staking.unstakeClassic(index);
      await tx.wait();

      await refreshLiveData(contracts.wallet.account);
      await logTx(tx.hash, contracts.wallet.account, "Classic Unstake", `Stake index ${index}`);
      return true;
    } catch (err) {
      console.error("Classic unstake failed:", err);
      alert(err.shortMessage || err.message || "Classic unstake failed.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const claimClassicRewards = async () => {
    setLoading(true);
    try {
      const contracts = await getContracts();
      if (!contracts) return false;

      const tx = await contracts.staking.claimClassicRewards();
      await tx.wait();

      await refreshLiveData(contracts.wallet.account);
      await logTx(tx.hash, contracts.wallet.account, "Claim Yield", "Classic staking rewards");
      return true;
    } catch (err) {
      console.error("Claim rewards failed:", err);
      alert(err.shortMessage || err.message || "Claim rewards failed.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const stakeLiquid = async (amount) => {
    setLoading(true);
    try {
      const contracts = await getContracts();
      if (!contracts) return false;

      const parsed = ethers.parseEther(amount);
      await approveIfNeeded(contracts.blx, contracts.wallet.account, addresses.BlumeStaking, parsed);
      const tx = await contracts.staking.stakeLiquid(parsed);
      await tx.wait();

      await refreshLiveData(contracts.wallet.account);
      await logTx(tx.hash, contracts.wallet.account, "Stake Liquid (stBLX)", `Deposit ${amount} BLX`);
      return true;
    } catch (err) {
      console.error("Liquid stake failed:", err);
      alert(err.shortMessage || err.message || "Liquid stake failed.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const unstakeLiquid = async (amount) => {
    setLoading(true);
    try {
      const contracts = await getContracts();
      if (!contracts) return false;

      const parsed = ethers.parseEther(amount);
      const tx = await contracts.staking.unstakeLiquid(parsed);
      await tx.wait();

      await refreshLiveData(contracts.wallet.account);
      await logTx(tx.hash, contracts.wallet.account, "Redeem stBLX", `Burn ${amount} stBLX`);
      return true;
    } catch (err) {
      console.error("Liquid unstake failed:", err);
      alert(err.shortMessage || err.message || "Liquid unstake failed.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const depositVault = async (amount) => {
    setLoading(true);
    try {
      const contracts = await getContracts();
      if (!contracts) return false;

      const parsed = ethers.parseEther(amount);
      await approveIfNeeded(contracts.blx, contracts.wallet.account, addresses.BlumeVault, parsed);
      const tx = await contracts.vault.deposit(parsed, contracts.wallet.account);
      await tx.wait();

      await refreshLiveData(contracts.wallet.account);
      await logTx(tx.hash, contracts.wallet.account, "Vault Deposit (vBLX)", `Deposit ${amount} BLX`);
      return true;
    } catch (err) {
      console.error("Vault deposit failed:", err);
      alert(err.shortMessage || err.message || "Vault deposit failed.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const withdrawVault = async (amount) => {
    setLoading(true);
    try {
      const contracts = await getContracts();
      if (!contracts) return false;

      const shares = ethers.parseEther(amount);
      const tx = await contracts.vault.redeem(shares, contracts.wallet.account, contracts.wallet.account);
      await tx.wait();

      await refreshLiveData(contracts.wallet.account);
      await logTx(tx.hash, contracts.wallet.account, "Vault Redeem", `Burn ${amount} vBLX shares`);
      return true;
    } catch (err) {
      console.error("Vault redeem failed:", err);
      alert(err.shortMessage || err.message || "Vault redeem failed.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const fetchUserStakes = async (account, addressMap = addresses) => {
    try {
      if (!window.ethereum || !addressMap.BlumeStaking) return;

      const provider = new ethers.BrowserProvider(window.ethereum);
      const StakingArtifact = await import("../../../blockchain/artifacts/contracts/BlumeStaking.sol/BlumeStaking.json");
      const staking = new ethers.Contract(addressMap.BlumeStaking, StakingArtifact.abi, provider);
      const count = Number(await staking.getUserStakesCount(account));
      const nextStakes = [];

      for (let i = 0; i < count; i++) {
        const stake = await staking.userStakes(account, i);
        const amount = Number(ethers.formatEther(stake.amount));
        nextStakes.push({
          index: i,
          amount: amount.toFixed(2),
          lockPeriodId: Number(stake.lockPeriodId),
          apy: LOCK_APYS[Number(stake.lockPeriodId)] || 0,
          unlockDate: LOCK_LABELS[Number(stake.lockPeriodId)] || "Unknown",
          status: amount > 0 ? "Locked" : "Unstaked"
        });
      }

      setUserStakes(nextStakes);
    } catch (error) {
      console.error("Error fetching stakes:", error);
    }
  };

  const fetchBalances = async (address, addressMap = addresses) => {
    try {
      if (!window.ethereum) return;

      const provider = new ethers.BrowserProvider(window.ethereum);
      const [
        BLXTokenArtifact,
        StBLXTokenArtifact,
        MockUSDTArtifact,
        LPArtifact,
        VaultArtifact,
        StakingArtifact
      ] = await Promise.all([
        import("../../../blockchain/artifacts/contracts/BLXToken.sol/BLXToken.json"),
        import("../../../blockchain/artifacts/contracts/stBLXToken.sol/stBLXToken.json"),
        import("../../../blockchain/artifacts/contracts/MockUSDT.sol/MockUSDT.json"),
        import("../../../blockchain/artifacts/contracts/BlumeLP.sol/BlumeLP.json"),
        import("../../../blockchain/artifacts/contracts/BlumeVault.sol/BlumeVault.json"),
        import("../../../blockchain/artifacts/contracts/BlumeStaking.sol/BlumeStaking.json")
      ]);

      const blxContract = new ethers.Contract(addressMap.BLXToken, BLXTokenArtifact.abi, provider);
      const stBlxContract = new ethers.Contract(addressMap.stBLXToken, StBLXTokenArtifact.abi, provider);
      const usdtContract = new ethers.Contract(addressMap.MockUSDT, MockUSDTArtifact.abi, provider);
      const lpContract = new ethers.Contract(addressMap.BlumeLP, LPArtifact.abi, provider);
      const vaultContract = new ethers.Contract(addressMap.BlumeVault, VaultArtifact.abi, provider);
      const stakingContract = new ethers.Contract(addressMap.BlumeStaking, StakingArtifact.abi, provider);

      if (!addressMap.BLXToken) {
        throw new Error("BLXToken address is not configured");
      }

      const readResults = await Promise.allSettled([
        blxContract.balanceOf(address),
        stBlxContract.balanceOf(address),
        usdtContract.balanceOf(address),
        lpContract.balanceOf(address),
        vaultContract.balanceOf(address),
        stakingContract.getPendingClassicRewards(address)
      ]);

      const getValue = (index, fallback = 0n) => (
        readResults[index].status === "fulfilled" ? readResults[index].value : fallback
      );

      setBalances({
        blx: Number(ethers.formatEther(getValue(0))),
        stBlx: Number(ethers.formatEther(getValue(1))),
        vBlx: Number(ethers.formatEther(getValue(4))),
        lp: Number(ethers.formatEther(getValue(3))),
        usdt: Number(ethers.formatUnits(getValue(2), 6)),
        pendingRewards: Number(ethers.formatEther(getValue(5)))
      });
    } catch (error) {
      console.error("Error fetching balances:", error);
    }
  };

  return (
    <Web3Context.Provider
      value={{
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
        fetchBalances,
        refreshLiveData
      }}
    >
      {children}
    </Web3Context.Provider>
  );
};

export const useWeb3 = () => useContext(Web3Context);
