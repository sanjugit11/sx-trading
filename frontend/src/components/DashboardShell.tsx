"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useWeb3 } from "@/context/Web3Context";
import { useRouter, usePathname } from "next/navigation";
import { 
  TrendingUp, 
  Coins, 
  Layers, 
  EyeOff, 
  ShieldCheck, 
  LayoutDashboard, 
  Wallet, 
  LogOut, 
  AlertTriangle,
  Menu,
  X,
  Server,
  Droplets,
  CheckCircle2,
  ShieldAlert,
  Gift
} from "lucide-react";
import axios from "axios";
import { ethers } from "ethers";
import { CONTRACT_ADDRESSES, CONTRACT_ABIS } from "@/blockchain/config";

interface DashboardShellProps {
  children: React.ReactNode;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({ children }) => {
  const { address, isAuthenticated, disconnect, sendTransaction } = useWeb3();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const [backendHealthy, setBackendHealthy] = useState(true);

  // USDT faucet state
  const [usdtBalance, setUsdtBalance] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);
  const [mintSuccess, setMintSuccess] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);

  const MINT_AMOUNT = ethers.parseUnits("10000", 18); // 10,000 USDT

  const fetchUsdtBalance = useCallback(async () => {
    if (!address) return;
    try {
      const provider = new ethers.JsonRpcProvider("https://rpc.hoodi.ethpandaops.io");
      const contract = new ethers.Contract(
        CONTRACT_ADDRESSES.usdt,
        CONTRACT_ABIS.usdt,
        provider
      );
      const raw: bigint = await contract.balanceOf(address);
      setUsdtBalance(parseFloat(ethers.formatUnits(raw, 18)).toLocaleString(undefined, { maximumFractionDigits: 0 }));
    } catch (err) {
      console.warn("Could not fetch USDT balance:", err);
    }
  }, [address]);

  const handleMintUsdt = async () => {
    if (!address) return;
    setMinting(true);
    setMintError(null);
    setMintSuccess(false);
    try {
      await sendTransaction(
        CONTRACT_ADDRESSES.usdt,
        CONTRACT_ABIS.usdt,
        "mint",
        [address, MINT_AMOUNT]
      );
      setMintSuccess(true);
      await fetchUsdtBalance();
      setTimeout(() => setMintSuccess(false), 3000);
    } catch (err: any) {
      setMintError(err.message || "Mint failed");
      setTimeout(() => setMintError(null), 4000);
    } finally {
      setMinting(false);
    }
  };

  // Fetch USDT balance on mount and when address changes
  useEffect(() => {
    fetchUsdtBalance();
  }, [fetchUsdtBalance]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, router]);

  // Check health and Kill Switch status from backend periodically
  useEffect(() => {
    const checkStatus = async () => {
      // Health check
      try {
        const res = await axios.get("/health");
        setBackendHealthy(res.data.status === "healthy");
      } catch {
        setBackendHealthy(false);
      }

      // Read on-chain kill switch status
      try {
        const adminRes = await axios.get("/api/admin/status");
        setKillSwitchActive(adminRes.data.killSwitchActive === true);
      } catch {
        // Non-fatal: keep previous state if endpoint unreachable
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#03040b] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-slate-400 text-sm">Authenticating session...</span>
        </div>
      </div>
    );
  }

  const navItems = [
    { name: "Unified Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { name: "Perpetual Terminal", path: "/perpetual", icon: TrendingUp },
    { name: "Lending Pool", path: "/lending", icon: Coins },
    { name: "Leveraged Spot", path: "/spot", icon: Layers },
    { name: "Hidden Orders", path: "/hidden", icon: EyeOff },
    { name: "SXR Rewards", path: "/rewards", icon: Gift },
    { name: "Admin Panel", path: "/admin", icon: ShieldCheck },
    { name: "Security & Compliance", path: "/compliance", icon: ShieldAlert },
    { name: "Event Indexer", path: "/admin/indexer", icon: Server },
  ];

  const handleLogout = () => {
    disconnect();
    router.push("/");
  };

  const truncatedAddress = address ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}` : "";

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#03040b] text-slate-100">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between p-4 bg-[#0a0b17]/80 backdrop-blur-md border-b border-white/5 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-400 to-purple-600 flex items-center justify-center font-bold text-sm tracking-wider font-orbitron">SX</div>
          <span className="font-orbitron font-bold text-lg bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">TRADING</span>
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-slate-400 hover:text-white">
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Sidebar Navigation */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#05060f]/90 backdrop-blur-lg border-r border-white/5 p-6 flex flex-col justify-between transform transition-transform duration-300 md:translate-x-0 md:static md:h-screen ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex flex-col gap-8">
          {/* Logo */}
          <div className="hidden md:flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-400 to-purple-600 flex items-center justify-center font-extrabold text-base tracking-wider font-orbitron">SX</div>
            <div>
              <span className="font-orbitron font-extrabold text-xl bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">TRADING</span>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-orbitron">DeFi Suite</div>
            </div>
          </div>

          {/* Links */}
          <nav className="flex flex-col gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => {
                    router.push(item.path);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${active ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "text-slate-400 hover:bg-white/5 hover:text-white border border-transparent"}`}
                >
                  <Icon size={18} />
                  <span>{item.name}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer info & Logout */}
        <div className="flex flex-col gap-4 border-t border-white/5 pt-4">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300">
              <Wallet size={16} />
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-slate-400 font-mono">{truncatedAddress}</span>
              <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-orbitron">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                ACTIVE
              </span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-rose-400 hover:bg-rose-500/10 transition-all border border-transparent hover:border-rose-500/20"
          >
            <LogOut size={18} />
            <span>Disconnect</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Status Bar */}
        <div className="bg-[#05060f]/60 backdrop-blur-md border-b border-white/5 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-orbitron font-bold text-slate-200">
              {navItems.find(item => item.path === pathname)?.name || "SX Terminal"}
            </h1>

            {/* Kill Switch Pulsing Alert */}
            {killSwitchActive && (
              <div className="bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs px-3 py-1.5 rounded-lg flex items-center gap-2 animate-pulse">
                <AlertTriangle size={14} />
                <span className="font-orbitron font-bold">PROTOCOL HALTED</span>
              </div>
            )}
          </div>

          {/* Connection metrics + Mint USDT faucet */}
          <div className="flex items-center gap-3 text-xs flex-wrap">
            {/* USDT Balance */}
            <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
              <Coins size={13} className="text-emerald-400" />
              <span className="text-slate-400">USDT:</span>
              <span className="text-emerald-400 font-mono font-semibold">
                {usdtBalance !== null ? usdtBalance : "—"}
              </span>
            </div>

            {/* Mint USDT Button */}
            <button
              onClick={handleMintUsdt}
              disabled={minting}
              title="Mint 10,000 test USDT to your wallet"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-orbitron font-bold transition-all ${
                mintSuccess
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                  : mintError
                  ? "bg-rose-500/15 border-rose-500/30 text-rose-400"
                  : "bg-cyan-500/10 border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20"
              } disabled:opacity-60`}
            >
              {minting ? (
                <><div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" /><span>MINTING…</span></>
              ) : mintSuccess ? (
                <><CheckCircle2 size={13} /><span>MINTED!</span></>
              ) : mintError ? (
                <><span>FAILED</span></>
              ) : (
                <><Droplets size={13} /><span>MINT 10K USDT</span></>
              )}
            </button>

            <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
              <Server size={14} className="text-cyan-400" />
              <span className="text-slate-400">Node:</span>
              <span className="text-emerald-400 font-mono">Hoodi Testnet</span>
            </div>

            <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
              <span className="text-slate-400">Backend:</span>
              {backendHealthy ? (
                <span className="text-emerald-400 font-medium">ONLINE</span>
              ) : (
                <span className="text-rose-400 font-medium animate-pulse">OFFLINE</span>
              )}
            </div>
          </div>
        </div>

        {/* Content Children */}
        <main className="p-6 md:p-8 flex-1 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
};
