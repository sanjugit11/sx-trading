"use client";

import React, { useEffect, useState, useCallback } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { useWeb3 } from "@/context/Web3Context";
import { 
  Gift, 
  Award, 
  TrendingUp, 
  Coins, 
  Layers, 
  EyeOff, 
  ArrowUpRight, 
  RefreshCw, 
  CheckCircle2, 
  Sparkles,
  Zap,
  Info
} from "lucide-react";
import axios from "axios";

interface RewardsData {
  success: boolean;
  address: string;
  totalRewards: number;
  perpRewards: number;
  lendingRewards: number;
  spotRewards: number;
  hiddenRewards: number;
  details: {
    activePerpsCount: number;
    activeLoansCount: number;
    activeSpotsCount: number;
    hiddenOrdersCount: number;
  };
}

export default function RewardsPage() {
  const { token, address } = useWeb3();
  const [rewards, setRewards] = useState<RewardsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [claimTxHash, setClaimTxHash] = useState("");

  const fetchRewards = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await axios.get("/api/rewards", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRewards(res.data);
    } catch (err) {
      console.error("Failed to fetch rewards details:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchRewards();
    }
  }, [token, fetchRewards]);

  const handleClaim = async () => {
    if (!rewards || !token || rewards.totalRewards === 0) return;
    setClaiming(true);
    try {
      const res = await axios.post("/api/rewards/claim", {
        amount: rewards.totalRewards
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data && res.data.success) {
        setClaimTxHash(res.data.txHash);
        setClaimSuccess(true);
        // Refresh rewards (since they are logged/claimed)
        await fetchRewards();
      }
    } catch (err) {
      console.error("Failed to claim rewards:", err);
    } finally {
      setClaiming(false);
    }
  };

  return (
    <DashboardShell>
      <div className="flex flex-col gap-8 max-w-7xl mx-auto">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-orbitron font-extrabold text-white flex items-center gap-2">
              <Gift className="text-cyan-400" />
              SXR Loyalty Rewards Center
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Earn SXR tokens automatically based on your trading, borrowing, and positioning activities across all terminals.
            </p>
          </div>
          
          <button
            onClick={fetchRewards}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all text-xs font-semibold font-orbitron cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? "animate-spin text-cyan-400" : "text-cyan-400"} />
            <span>SYNC REWARDS</span>
          </button>
        </div>

        {loading && !rewards ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-slate-400 text-xs font-orbitron">Calculating your loyalty volume...</span>
          </div>
        ) : (
          <>
            {/* Total Balance Card */}
            <div className="glass-panel p-8 rounded-2xl border border-cyan-500/20 relative overflow-hidden bg-gradient-to-br from-cyan-950/20 via-slate-900/40 to-slate-950/40 flex flex-col md:flex-row justify-between items-center gap-8">
              <div className="absolute -top-12 -left-12 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl -z-10 animate-pulse"></div>
              <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl -z-10"></div>
              
              <div className="flex items-center gap-5">
                <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-400/20 text-cyan-400 shadow-lg shadow-cyan-500/5">
                  <Award size={36} />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-slate-500 font-orbitron uppercase tracking-widest">Total Accumulated Loyalty Balance</span>
                  <div className="flex items-baseline gap-2">
                    <span className="font-orbitron text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-300 to-cyan-400">
                      {rewards ? rewards.totalRewards.toLocaleString() : "0"}
                    </span>
                    <span className="font-orbitron font-extrabold text-sm text-cyan-400 tracking-wider">SXR</span>
                  </div>
                  <span className="text-[11px] text-slate-400 flex items-center gap-1 mt-1">
                    <Zap size={12} className="text-amber-400" />
                    Accumulation Rate: <strong className="text-white font-semibold">1 SXR per $1</strong> of active terminal volume.
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-center md:items-end gap-3 w-full md:w-auto">
                <button
                  onClick={handleClaim}
                  disabled={claiming || !rewards || rewards.totalRewards === 0}
                  className="w-full md:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-orbitron font-extrabold text-xs tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/10 hover:shadow-cyan-400/20 cursor-pointer flex items-center justify-center gap-2"
                >
                  {claiming ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>MINTING SXR REWARDS...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      <span>CLAIM REWARDS TO WALLET</span>
                    </>
                  )}
                </button>
                <span className="text-[10px] text-slate-500 font-orbitron">No gas fee: fully sponsored by SX Protocol DAO</span>
              </div>
            </div>

            {/* Claim Success Banner */}
            {claimSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/25 p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-fade-in">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="text-emerald-400 flex-shrink-0" size={20} />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold text-white font-orbitron tracking-wide">REWARDS MINTED SUCCESSFULLY</span>
                    <span className="text-[10px] text-emerald-400 font-mono">Tx Hash: {claimTxHash}</span>
                  </div>
                </div>
                <button
                  onClick={() => setClaimSuccess(false)}
                  className="text-[10px] text-slate-400 hover:text-white font-orbitron border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                >
                  DISMISS
                </button>
              </div>
            )}

            {/* Terminal Breakdown Header */}
            <div className="flex flex-col gap-1.5 border-b border-white/5 pb-2 mt-4">
              <h3 className="font-orbitron font-extrabold text-sm text-slate-200 tracking-wider">REWARDS EARNED BY TERMINAL</h3>
              <p className="text-[11px] text-slate-500">Live breakdown of accumulated points calculated at a 1:1 ratio with USD value.</p>
            </div>

            {/* Terminal Breakdown Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              
              {/* Perpetual Terminal */}
              <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col justify-between gap-6 relative overflow-hidden bg-[#070b19]/20 hover:border-cyan-500/20 transition-all group">
                <div className="absolute top-0 right-0 w-20 h-20 bg-cyan-500/5 rounded-full blur-xl -z-10 group-hover:bg-cyan-500/10 transition-all"></div>
                <div className="flex justify-between items-start">
                  <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/10 text-cyan-400">
                    <TrendingUp size={20} />
                  </div>
                  <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold font-orbitron">1:1 RATE</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-orbitron uppercase tracking-wider block mb-1">Perpetuals Terminal</span>
                  <div className="text-xl font-orbitron font-black text-white">
                    {rewards ? rewards.perpRewards.toLocaleString() : "0"}{" "}
                    <span className="text-xs font-semibold text-slate-400 font-sans">SXR</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-2 flex flex-col gap-0.5">
                    <span>Rate: 1 SXR per $1 of exposure</span>
                    <span className="text-cyan-400">Active positions: {rewards?.details.activePerpsCount || 0}</span>
                  </div>
                </div>
              </div>

              {/* Lending Pool */}
              <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col justify-between gap-6 relative overflow-hidden bg-[#0a0719]/20 hover:border-purple-500/20 transition-all group">
                <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/5 rounded-full blur-xl -z-10 group-hover:bg-purple-500/10 transition-all"></div>
                <div className="flex justify-between items-start">
                  <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/10 text-purple-400">
                    <Coins size={20} />
                  </div>
                  <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold font-orbitron">1:1 RATE</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-orbitron uppercase tracking-wider block mb-1">Lending Pool</span>
                  <div className="text-xl font-orbitron font-black text-white">
                    {rewards ? rewards.lendingRewards.toLocaleString() : "0"}{" "}
                    <span className="text-xs font-semibold text-slate-400 font-sans">SXR</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-2 flex flex-col gap-0.5">
                    <span>Rate: 1 SXR per $1 supplied + borrowed</span>
                    <span className="text-purple-400">Active loans: {rewards?.details.activeLoansCount || 0}</span>
                  </div>
                </div>
              </div>

              {/* Leveraged Spot */}
              <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col justify-between gap-6 relative overflow-hidden bg-[#190715]/20 hover:border-pink-500/20 transition-all group">
                <div className="absolute top-0 right-0 w-20 h-20 bg-pink-500/5 rounded-full blur-xl -z-10 group-hover:bg-pink-500/10 transition-all"></div>
                <div className="flex justify-between items-start">
                  <div className="p-3 rounded-xl bg-pink-500/10 border border-pink-500/10 text-pink-400">
                    <Layers size={20} />
                  </div>
                  <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20 font-bold font-orbitron">1:1 RATE</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-orbitron uppercase tracking-wider block mb-1">Leveraged Spot</span>
                  <div className="text-xl font-orbitron font-black text-white">
                    {rewards ? rewards.spotRewards.toLocaleString() : "0"}{" "}
                    <span className="text-xs font-semibold text-slate-400 font-sans">SXR</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-2 flex flex-col gap-0.5">
                    <span>Rate: 1 SXR per $1 of spot position size</span>
                    <span className="text-pink-400">Active positions: {rewards?.details.activeSpotsCount || 0}</span>
                  </div>
                </div>
              </div>

              {/* Hidden Orders */}
              <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col justify-between gap-6 relative overflow-hidden bg-[#07190f]/20 hover:border-emerald-500/20 transition-all group">
                <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-full blur-xl -z-10 group-hover:bg-emerald-500/10 transition-all"></div>
                <div className="flex justify-between items-start">
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/10 text-emerald-400">
                    <EyeOff size={20} />
                  </div>
                  <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold font-orbitron">1000 SXR / TX</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-orbitron uppercase tracking-wider block mb-1">Hidden Orders</span>
                  <div className="text-xl font-orbitron font-black text-white">
                    {rewards ? rewards.hiddenRewards.toLocaleString() : "0"}{" "}
                    <span className="text-xs font-semibold text-slate-400 font-sans">SXR</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-2 flex flex-col gap-0.5">
                    <span>Rate: 1000 SXR flat per placed order</span>
                    <span className="text-emerald-400">Orders placed: {rewards?.details.hiddenOrdersCount || 0}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Loyalty Rules & Program Details */}
            <div className="glass-panel p-6 rounded-2xl border border-white/5 bg-[#05060f]/60 flex flex-col gap-4 mt-4">
              <h4 className="font-orbitron font-bold text-xs text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Info size={14} className="text-cyan-400" />
                SX Protocol Loyalty Program Rules
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-[11px] text-slate-400 leading-relaxed">
                <div>
                  <span className="text-white block font-semibold mb-1">How are rewards tracked?</span>
                  SXR loyalty points are monitored in real-time by indexing active position sizes and margin deposits directly from smart contracts on the Hoodi testnet.
                </div>
                <div>
                  <span className="text-white block font-semibold mb-1">What is the 1 SXR per $1 rate?</span>
                  Every dollar of active exposure, leveraged spot volume, or lent/borrowed assets maps 1-to-1 to SXR points, ensuring utility scales with protocol participation.
                </div>
                <div>
                  <span className="text-white block font-semibold mb-1">When can I claim rewards?</span>
                  You can claim SXR tokens directly to your connected wallet at any time. Claims are gasless and executed by the backend's relayer wallet.
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
