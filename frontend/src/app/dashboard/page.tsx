"use client";

import React, { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { useWeb3 } from "@/context/Web3Context";
import { 
  TrendingUp, 
  Percent, 
  ShieldAlert, 
  Coins, 
  HelpCircle, 
  ChevronRight,
  TrendingDown,
  RefreshCw
} from "lucide-react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip as ChartTooltip, 
  ResponsiveContainer 
} from "recharts";
import axios from "axios";
import io from "socket.io-client";

interface DashboardMetrics {
  totalExposureUSD: string;
  totalCollateralUSD: string;
  riskScore: number;
  walletBalanceUSD: number;   // live on-chain USDT balanceOf()
}

export default function DashboardPage() {
  const { token, address } = useWeb3();
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalExposureUSD: "0.0",
    totalCollateralUSD: "0.0",
    riskScore: 0,
    walletBalanceUSD: 0
  });
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Track previous net worth to compute 24h-like change between refreshes
  const [prevNetWorth, setPrevNetWorth] = useState<number | null>(null);

  // Protocol equity (collateral locked in positions minus exposure)
  const protocolEquity = Math.max(0, parseFloat(metrics.totalCollateralUSD) - parseFloat(metrics.totalExposureUSD));

  // Total Net Worth = on-chain USDT wallet balance + protocol equity
  const netWorth = metrics.walletBalanceUSD + protocolEquity;

  // Compute percentage change vs the snapshot before the last refresh
  const netWorthChange = prevNetWorth !== null && prevNetWorth > 0
    ? ((netWorth - prevNetWorth) / prevNetWorth) * 100
    : null;

  const dynamicChartData = [
    { name: "Day 1", balance: Math.round(netWorth * 0.90) },
    { name: "Day 2", balance: Math.round(netWorth * 0.94) },
    { name: "Day 3", balance: Math.round(netWorth * 0.92) },
    { name: "Day 4", balance: Math.round(netWorth * 0.97) },
    { name: "Day 5", balance: Math.round(netWorth * 0.96) },
    { name: "Day 6", balance: Math.round(netWorth * 0.99) },
    { name: "Day 7", balance: Math.round(netWorth) }
  ];

  // Fetch Dashboard metrics and user profile
  const fetchDashboardData = async () => {
    if (!token) return;
    try {
      const [profileRes, dashboardRes] = await Promise.all([
        axios.get("/api/user/profile", {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get("/api/dashboard", {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      setUserProfile(profileRes.data);
      // Snapshot current net worth before updating so we can show the delta
      setMetrics((prev) => {
        const currentNW = prev.walletBalanceUSD +
          Math.max(0, parseFloat(prev.totalCollateralUSD) - parseFloat(prev.totalExposureUSD));
        if (currentNW > 0) setPrevNetWorth(currentNW);
        // Merge with previous state so missing fields never become undefined
        return { ...prev, ...dashboardRes.data };
      });
    } catch (err) {
      console.error("Error loading dashboard data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    // Hook up real-time websocket updates
    if (!address) return;
    const socket = io("http://localhost:3000");

    socket.emit("subscribe", `user:${address.toLowerCase()}`);

    socket.on("position_update", (data) => {
      console.log("Real-time position update received:", data);
      fetchDashboardData();
    });

    return () => {
      socket.disconnect();
    };
  }, [token, address]);

  const triggerRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const getRiskColor = (score: number) => {
    if (score < 30) return "text-emerald-400 border-emerald-500/20 bg-emerald-500/5";
    if (score < 75) return "text-amber-400 border-amber-500/20 bg-amber-500/5";
    return "text-rose-400 border-rose-500/20 bg-rose-500/5 animate-pulse";
  };

  const getRiskLabel = (score: number) => {
    if (score < 30) return "Healthy";
    if (score < 75) return "Moderate Skew";
    return "High Risk Liquidation Warning";
  };

  return (
    <DashboardShell>
      <div className="flex flex-col gap-8">
        {/* Profile Card and Refresh Panel */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="font-orbitron font-bold text-2xl text-white">Unified Overview</h2>
            <p className="text-xs text-slate-400 mt-1">Cross-terminal margins and risk health matrix.</p>
          </div>
          <button
            onClick={triggerRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all text-xs font-semibold font-orbitron"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin text-cyan-400" : "text-cyan-400"} />
            <span>REFRESH TERMINAL</span>
          </button>
        </div>

        {/* Stats Row Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Net Worth */}
          <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between border border-white/5">
            <div className="flex justify-between items-start">
              <span className="text-xs text-slate-500 font-orbitron uppercase tracking-wider">Net Worth (Balance)</span>
              <Coins size={18} className="text-cyan-400" />
            </div>
            <div className="mt-4">
              <span className="font-orbitron text-2xl md:text-3xl font-black text-white">
                ${netWorth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              {netWorthChange !== null ? (
                <div className={`text-[10px] flex items-center gap-1 mt-1 ${
                  netWorthChange >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}>
                  {netWorthChange >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  <span>{netWorthChange >= 0 ? "+" : ""}{netWorthChange.toFixed(2)}% since last refresh</span>
                </div>
              ) : (
                <div className="text-[10px] text-slate-500 mt-1">Wallet + protocol equity</div>
              )}
              {/* Breakdown */}
              <div className="mt-2 flex flex-col gap-0.5">
                <div className="text-[10px] text-slate-600 flex justify-between">
                  <span>Wallet USDT</span>
                  <span className="font-mono text-slate-400">${metrics.walletBalanceUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
                {protocolEquity > 0 && (
                  <div className="text-[10px] text-slate-600 flex justify-between">
                    <span>Protocol equity</span>
                    <span className="font-mono text-slate-400">${protocolEquity.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Exposure */}
          <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between border border-white/5">
            <div className="flex justify-between items-start">
              <span className="text-xs text-slate-500 font-orbitron uppercase tracking-wider">Total Exposure</span>
              <TrendingUp size={18} className="text-purple-400" />
            </div>
            <div className="mt-4">
              <span className="font-orbitron text-2xl md:text-3xl font-black text-white">
                ${Number(metrics.totalExposureUSD).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <div className="text-[10px] text-slate-500 mt-1">Sum of active derivatives size</div>
            </div>
          </div>

          {/* Collaterals */}
          <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between border border-white/5">
            <div className="flex justify-between items-start">
              <span className="text-xs text-slate-500 font-orbitron uppercase tracking-wider">Cross-Collateral</span>
              <Percent size={18} className="text-pink-400" />
            </div>
            <div className="mt-4">
              <span className="font-orbitron text-2xl md:text-3xl font-black text-white">
                ${Number(metrics.totalCollateralUSD).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <div className="text-[10px] text-slate-500 mt-1">Lending borrow security value</div>
            </div>
          </div>

          {/* Unified Risk Score */}
          <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between border border-white/5">
            <div className="flex justify-between items-start">
              <span className="text-xs text-slate-500 font-orbitron uppercase tracking-wider">Unified Risk Score</span>
              <ShieldAlert size={18} className={metrics.riskScore >= 75 ? "text-rose-400 animate-pulse" : "text-amber-400"} />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div>
                <span className="font-orbitron text-2xl md:text-3xl font-black text-white">
                  {metrics.riskScore}%
                </span>
                <div className="text-[10px] text-slate-400 mt-1">Leverage & Debt skews</div>
              </div>
              <div className={`text-[10px] font-bold font-orbitron uppercase px-2.5 py-1.5 rounded-lg border ${getRiskColor(metrics.riskScore)}`}>
                {getRiskLabel(metrics.riskScore)}
              </div>
            </div>
          </div>
        </div>

        {/* Chart View */}
        <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col gap-6">
          <div className="flex justify-between items-center">
            <h3 className="font-orbitron font-bold text-base text-white">Margin Portfolio Performance</h3>
            <span className="text-[10px] text-slate-500">Real-time simulation tracking</span>
          </div>

          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dynamicChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00f0ff" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#00f0ff" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#475569" fontSize={10} tickLine={false} />
                <YAxis stroke="#475569" fontSize={10} tickLine={false} domain={['dataMin - 500', 'dataMax + 500']} />
                <ChartTooltip 
                  contentStyle={{ backgroundColor: "#0b0c16", borderColor: "rgba(255,255,255,0.08)", borderRadius: "8px" }}
                  labelStyle={{ color: "#94a3b8", fontSize: "11px", fontFamily: "Orbitron" }}
                  itemStyle={{ color: "#f8fafc", fontSize: "12px" }}
                />
                <Area type="monotone" dataKey="balance" stroke="#00f0ff" strokeWidth={2} fillOpacity={1} fill="url(#colorBalance)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Position Hub Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
            <span className="font-orbitron font-bold text-sm text-slate-200 uppercase tracking-wider">Perpetuals</span>
            <p className="text-xs text-slate-400 leading-relaxed">Cross or isolated leverage up to 1000x with automated protection guarantees capping negative balances.</p>
            <a href="/perpetual" className="text-xs text-cyan-400 font-orbitron font-bold flex items-center gap-1 mt-auto hover:text-cyan-300">
              <span>OPEN TERMINAL</span>
              <ChevronRight size={14} />
            </a>
          </div>

          <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
            <span className="font-orbitron font-bold text-sm text-slate-200 uppercase tracking-wider">Lending Pool</span>
            <p className="text-xs text-slate-400 leading-relaxed">Lock collateral tokens to borrow multi-asset pools. Utilizes a strict 250% minimum collateral LTV limit.</p>
            <a href="/lending" className="text-xs text-purple-400 font-orbitron font-bold flex items-center gap-1 mt-auto hover:text-purple-300">
              <span>SUPPLY & BORROW</span>
              <ChevronRight size={14} />
            </a>
          </div>

          <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
            <span className="font-orbitron font-bold text-sm text-slate-200 uppercase tracking-wider">Hidden Commitments</span>
            <p className="text-xs text-slate-400 leading-relaxed">Place order hashes secretly using ZK parameters and salt vectors. Reveal and match executions dynamically.</p>
            <a href="/hidden" className="text-xs text-pink-400 font-orbitron font-bold flex items-center gap-1 mt-auto hover:text-pink-300">
              <span>REVEAL PORTAL</span>
              <ChevronRight size={14} />
            </a>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
