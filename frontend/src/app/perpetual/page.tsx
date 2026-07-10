"use client";

import React, { useEffect, useState, useCallback } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { useWeb3 } from "@/context/Web3Context";
import { 
  TrendingUp, 
  AlertCircle, 
  ArrowUpRight, 
  ArrowDownRight,
  TrendingDown,
  RefreshCw,
  Activity
} from "lucide-react";
import axios from "axios";
import { ethers } from "ethers";
import { CONTRACT_ADDRESSES, CONTRACT_ABIS } from "@/blockchain/config";

interface Position {
  id: string;
  posId: number;
  asset: string;
  leverage: number;
  marginAmount: number;
  size: number;
  isLong: boolean;
  isCross: boolean;
  entryPrice: number;
  isOpen: boolean;
  pnl?: number;
}

const fmt = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PerpetualPage() {
  const { token, sendTransaction } = useWeb3();

  // Form state
  const [asset, setAsset] = useState("0x2c75e12798e1648058F90E14baB1F1Eef3e4Fdf7");
  const [leverage, setLeverage] = useState(10);
  const [marginAmount, setMarginAmount] = useState(100);
  const [isLong, setIsLong] = useState(true);
  const [isCross, setIsCross] = useState(true);

  // Live market & account state
  const [positions, setPositions] = useState<Position[]>([]);
  const [hiddenPositionIds, setHiddenPositionIds] = useState<number[]>([]);
  const [crossTerminalSummary, setCrossTerminalSummary] = useState({
    items: [] as any[],
    totalCollateral: 0,
    totalExposure: 0,
    utilization: 0,
    counts: { perpetual: 0, spot: 0 }
  });
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [oraclePrice, setOraclePrice] = useState<number | null>(null);
  const [fundingRate, setFundingRate] = useState<number | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);

  // UI state
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived order estimates
  const positionSize = marginAmount * leverage;
  const estimatedLiqPrice =
    oraclePrice !== null
      ? isLong
        ? oraclePrice * (1 - 1 / leverage)
        : oraclePrice * (1 + 1 / leverage)
      : null;

  const fetchAll = useCallback(async () => {
    // 1. Fetch public market data (price & skew funding rate)
    try {
      const marketRes = await axios.get(`http://localhost:3000/api/market/${asset}`);
      setOraclePrice(marketRes.data.price ?? null);
      setFundingRate(marketRes.data.fundingRate ?? null);
    } catch (err) {
      console.error("Error fetching public market data:", err);
    } finally {
      setMarketLoading(false);
    }

    // 2. Fetch authenticated profile & positions if logged in
    if (!token) {
      setRefreshing(false);
      return;
    }

    try {
      const profileRes = await axios.get("http://localhost:3000/api/user/profile", {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Wallet balance
      setWalletBalance(profileRes.data?.wallet?.balanceUSD ?? null);

      const perpetualPositions = (profileRes.data?.perpetualPositions ?? profileRes.data?.positions ?? [])
        .filter((p: any) => p.isOpen)
        .filter((p: any) => !hiddenPositionIds.includes(Number(p.posId)));
      const spotPositions = (profileRes.data?.leveragedSpots ?? profileRes.data?.spots ?? [])
        .filter((p: any) => p.isOpen)
        .filter((p: any) => !hiddenPositionIds.includes(Number(p.posId)));

      setPositions(perpetualPositions);

      const aggregatedItems = [
        ...perpetualPositions.map((p: any) => ({
          ...p,
          type: "perpetual",
          collateralAmount: Number(p.marginAmount ?? 0),
          notional: Number(p.size ?? (Number(p.marginAmount ?? 0) * Number(p.leverage ?? 1)))
        })),
        ...spotPositions.map((s: any) => ({
          ...s,
          type: "spot",
          collateralAmount: Number(s.collateralAmount ?? 0),
          notional: Number(s.size ?? (Number(s.collateralAmount ?? 0) * Number(s.leverage ?? 1)))
        }))
      ];

      const totalCollateral = aggregatedItems.reduce((sum: number, item: any) => sum + Number(item.collateralAmount || 0), 0);
      const totalExposure = aggregatedItems.reduce((sum: number, item: any) => sum + Number(item.notional || 0), 0);
      const utilization = totalCollateral > 0 ? Math.min(100, (totalExposure / totalCollateral) * 100) : 0;

      setCrossTerminalSummary({
        items: aggregatedItems,
        totalCollateral,
        totalExposure,
        utilization,
        counts: {
          perpetual: perpetualPositions.length,
          spot: spotPositions.length
        }
      });
    } catch (err) {
      console.error("Error fetching perpetual profile data:", err);
    } finally {
      setRefreshing(false);
    }
  }, [token, asset, hiddenPositionIds]);

  useEffect(() => {
    fetchAll();
    // Refresh market data every 15 s
    const interval = setInterval(fetchAll, 15_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleOpenPosition = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const receipt = await sendTransaction(
        CONTRACT_ADDRESSES.sxpt,
        CONTRACT_ABIS.sxpt,
        "openPerpetualPosition",
        [asset, BigInt(leverage), ethers.parseEther(marginAmount.toString()), isLong, isCross]
      );

      // Parse the real on-chain positionId from events
      let posId = null;
      if (receipt && receipt.logs) {
        const sxptInterface = new ethers.Interface(CONTRACT_ABIS.sxpt);
        for (const log of receipt.logs) {
          try {
            const parsedLog = sxptInterface.parseLog(log);
            if (parsedLog && parsedLog.name === "PerpetualPositionOpened") {
              posId = Number(parsedLog.args.positionId);
              console.log("Parsed real on-chain positionId:", posId);
              break;
            }
          } catch (e) {
            // Ignore unrelated logs
          }
        }
      }

      await axios.post(
        "http://localhost:3000/api/perpetual/open",
        { posId, asset, leverage, marginAmount, isLong, isCross },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await fetchAll();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Transaction rejected or execution reverted.");
    } finally {
      setLoading(false);
    }
  };

  const handleClosePosition = async (posId: number) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const readProvider = new ethers.JsonRpcProvider("https://rpc.hoodi.ethpandaops.io");
      const readContract = new ethers.Contract(CONTRACT_ADDRESSES.sxpt, CONTRACT_ABIS.sxpt, readProvider);
      const onChainPosition = await readContract.positions(posId);

      if (!onChainPosition.isOpen) {
        setHiddenPositionIds((prev) => prev.includes(posId) ? prev : [...prev, posId]);
        setPositions((prev) => prev.filter((position) => position.posId !== posId));
        setCrossTerminalSummary((prev) => ({
          ...prev,
          counts: {
            ...prev.counts,
            perpetual: Math.max(0, prev.counts.perpetual - 1)
          }
        }));
        setError(`Perpetual position #${posId} is no longer open on-chain. It may already have been closed.`);
        setLoading(false);
        return;
      }

      setHiddenPositionIds((prev) => prev.includes(posId) ? prev : [...prev, posId]);
      setPositions((prev) => prev.filter((position) => position.posId !== posId));
      setCrossTerminalSummary((prev) => ({
        ...prev,
        counts: {
          ...prev.counts,
          perpetual: Math.max(0, prev.counts.perpetual - 1)
        }
      }));

      await sendTransaction(
        CONTRACT_ADDRESSES.sxpt,
        CONTRACT_ABIS.sxpt,
        "closePerpetualPosition",
        [BigInt(posId)]
      );

      await axios.post(
        `http://localhost:3000/api/perpetual/close/${posId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await fetchAll();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to close position on-chain.");
    } finally {
      setLoading(false);
    }
  };

  const fundingDisplay =
    fundingRate !== null
      ? `${fundingRate >= 0 ? "+" : ""}${(fundingRate * 100).toFixed(4)}% / hr`
      : "—";

  const fundingColor =
    fundingRate === null
      ? "text-slate-500"
      : isLong
      ? fundingRate >= 0
        ? "text-emerald-400"
        : "text-rose-400"
      : fundingRate < 0
      ? "text-emerald-400"
      : "text-rose-400";

  return (
    <DashboardShell>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Order Form Panel: 5 columns */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col gap-6">
            {/* Header with refresh */}
            <div className="flex justify-between items-center">
              <h3 className="font-orbitron font-bold text-base text-white">Place Derivative Order</h3>
              <button
                onClick={() => { setRefreshing(true); fetchAll(); }}
                disabled={refreshing}
                className="p-2 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-all"
                title="Refresh market data"
              >
                <RefreshCw size={13} className={refreshing ? "animate-spin text-cyan-400" : "text-cyan-400"} />
              </button>
            </div>

            {/* Long / Short */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setIsLong(true)}
                className={`py-3.5 rounded-xl font-orbitron font-bold text-sm tracking-wider flex items-center justify-center gap-2 border transition-all ${isLong ? "bg-emerald-500/10 border-emerald-400 text-emerald-400" : "bg-white/5 border-transparent text-slate-500 hover:text-slate-300"}`}
              >
                <ArrowUpRight size={16} />
                <span>BUY / LONG</span>
              </button>
              <button
                onClick={() => setIsLong(false)}
                className={`py-3.5 rounded-xl font-orbitron font-bold text-sm tracking-wider flex items-center justify-center gap-2 border transition-all ${!isLong ? "bg-rose-500/10 border-rose-400 text-rose-400" : "bg-white/5 border-transparent text-slate-500 hover:text-slate-300"}`}
              >
                <ArrowDownRight size={16} />
                <span>SELL / SHORT</span>
              </button>
            </div>

            {/* Margin Mode */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-500 uppercase font-orbitron tracking-wider">Margin Mode</label>
              <div className="grid grid-cols-2 bg-[#05060f] p-1.5 rounded-xl border border-white/5">
                <button
                  onClick={() => setIsCross(true)}
                  className={`py-2 rounded-lg text-xs font-semibold font-orbitron transition-all ${isCross ? "bg-white/5 text-cyan-400 border border-white/5" : "text-slate-500 hover:text-slate-300"}`}
                >
                  CROSS MARGIN
                </button>
                <button
                  onClick={() => setIsCross(false)}
                  className={`py-2 rounded-lg text-xs font-semibold font-orbitron transition-all ${!isCross ? "bg-white/5 text-cyan-400 border border-white/5" : "text-slate-500 hover:text-slate-300"}`}
                >
                  ISOLATED MARGIN
                </button>
              </div>
            </div>

            {/* Margin Amount */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center text-xs">
                <label className="text-slate-500 uppercase font-orbitron tracking-wider">Margin Amount</label>
                <span className="text-slate-400 font-mono">
                  Available:{" "}
                  {walletBalance !== null
                    ? `$${fmt(walletBalance)}`
                    : marketLoading
                    ? "Loading…"
                    : "—"}
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={marginAmount}
                  onChange={(e) => setMarginAmount(Number(e.target.value))}
                  className="w-full bg-[#05060f] border border-white/5 rounded-xl py-3 px-4 text-sm font-mono text-white focus:outline-none focus:border-cyan-400/50"
                  placeholder="0.00"
                  min={0}
                  max={walletBalance ?? undefined}
                />
                <span className="absolute right-4 top-3.5 text-xs text-slate-500 font-orbitron">USD</span>
              </div>
              {/* Quick-fill buttons */}
              {walletBalance !== null && (
                <div className="flex gap-2 mt-1">
                  {[0.25, 0.5, 0.75, 1].map((frac) => (
                    <button
                      key={frac}
                      onClick={() => setMarginAmount(Math.floor(walletBalance * frac))}
                      className="flex-1 py-1.5 text-[10px] font-orbitron font-semibold rounded-lg bg-white/5 border border-white/5 text-slate-400 hover:text-cyan-400 hover:border-cyan-400/30 transition-all"
                    >
                      {frac * 100}%
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Leverage Slider */}
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center text-xs">
                <label className="text-slate-500 uppercase font-orbitron tracking-wider">Position Leverage</label>
                <span className="text-cyan-400 font-orbitron font-bold text-sm">{leverage}x</span>
              </div>
              <input
                type="range"
                min="2"
                max="1000"
                value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value))}
                className="w-full h-1 bg-[#05060f] rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>2x</span>
                <span>250x</span>
                <span>500x</span>
                <span>750x</span>
                <span>1000x</span>
              </div>
            </div>

            {/* Order Estimates */}
            <div className="bg-[#05060f]/60 rounded-xl p-4 border border-white/5 flex flex-col gap-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Total Position Size:</span>
                <span className="font-mono text-white font-semibold">${fmt(positionSize)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Oracle Mark Price:</span>
                <span className="font-mono text-white font-semibold">
                  {oraclePrice !== null ? `$${fmt(oraclePrice)}` : marketLoading ? "Loading…" : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Est. Liquidation Price:</span>
                <span className="font-mono text-amber-400 font-semibold">
                  {estimatedLiqPrice !== null ? `$${fmt(estimatedLiqPrice)}` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Skew Funding Rate:</span>
                <span className={`font-mono font-semibold ${fundingColor}`}>{fundingDisplay}</span>
              </div>
            </div>

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs p-3.5 rounded-xl flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handleOpenPosition}
              disabled={loading || marginAmount <= 0 || (walletBalance !== null && marginAmount > walletBalance)}
              className="w-full py-4 rounded-xl glow-btn-cyan text-slate-950 font-orbitron font-bold text-sm tracking-wider cursor-pointer disabled:opacity-50"
            >
              {loading ? "CONFIRMING IN WALLET..." : "EXECUTE PERPETUAL TRADE"}
            </button>

            {walletBalance !== null && marginAmount > walletBalance && (
              <p className="text-[10px] text-rose-400 text-center -mt-3">
                Margin exceeds available wallet balance
              </p>
            )}
          </div>
        </div>

        {/* Right Panel: 7 columns */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Market Feed */}
          <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="font-orbitron font-bold text-sm text-slate-200">Derivative Mark Feed</span>
                <span className="text-[10px] font-bold bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded">
                  15s refresh
                </span>
              </div>
              <div className="flex items-center gap-3">
                {fundingRate !== null && (
                  <span className={`text-[10px] font-mono font-bold ${fundingColor}`}>
                    FR: {fundingDisplay}
                  </span>
                )}
                <span className="font-mono text-sm font-bold text-emerald-400">
                  {oraclePrice !== null ? `$${fmt(oraclePrice)}` : "—"}
                </span>
              </div>
            </div>
            <div className="h-[200px] w-full bg-[#05060f] rounded-xl flex items-center justify-center border border-white/5 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/5 to-purple-500/5 -z-10" />
              <Activity size={48} className="text-cyan-500/20 animate-pulse" />
              <span className="absolute bottom-4 right-4 text-[10px] text-slate-600 font-mono">
                Live WebSocket visualizer feed
              </span>
            </div>
          </div>

          {/* Cross-Terminal Exposure Summary */}
          <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h3 className="font-orbitron font-bold text-base text-white">Cross-Terminal Exposure</h3>
              <span className="text-[10px] text-slate-500 font-mono">{crossTerminalSummary.counts.perpetual + crossTerminalSummary.counts.spot} active</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl border border-white/5 bg-[#05060f]/70 p-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Open Positions</div>
                <div className="mt-1 text-lg font-orbitron font-semibold text-white">{crossTerminalSummary.counts.perpetual + crossTerminalSummary.counts.spot}</div>
                <div className="text-[10px] text-slate-500">{crossTerminalSummary.counts.perpetual} perp / {crossTerminalSummary.counts.spot} spot</div>
              </div>
              <div className="rounded-xl border border-white/5 bg-[#05060f]/70 p-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Collateral Locked</div>
                <div className="mt-1 text-lg font-orbitron font-semibold text-cyan-400">${fmt(crossTerminalSummary.totalCollateral)}</div>
              </div>
              <div className="rounded-xl border border-white/5 bg-[#05060f]/70 p-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Gross Exposure</div>
                <div className="mt-1 text-lg font-orbitron font-semibold text-emerald-400">${fmt(crossTerminalSummary.totalExposure)}</div>
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-[#05060f]/70 p-3">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Collateral Utilization</span>
                <span className="font-semibold text-white">{crossTerminalSummary.utilization.toFixed(1)}%</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-white/5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${crossTerminalSummary.utilization > 80 ? "bg-rose-400" : crossTerminalSummary.utilization > 60 ? "bg-amber-400" : "bg-emerald-400"}`}
                  style={{ width: `${Math.min(crossTerminalSummary.utilization, 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Open Positions List */}
          <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h3 className="font-orbitron font-bold text-base text-white">Active Perpetual Positions</h3>
              <span className="text-[10px] text-slate-500 font-mono">{positions.length} open</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-slate-500 uppercase font-orbitron tracking-wider">
                    <th className="pb-3 font-semibold">Direction</th>
                    <th className="pb-3 font-semibold">Leverage</th>
                    <th className="pb-3 font-semibold">Margin</th>
                    <th className="pb-3 font-semibold">Size</th>
                    <th className="pb-3 font-semibold">PnL</th>
                    <th className="pb-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500 italic">
                        No open positions detected.
                      </td>
                    </tr>
                  ) : (
                    positions.map((pos) => {
                      // Estimate live PnL using current oracle price
                      const livePnl =
                        oraclePrice !== null
                          ? pos.isLong
                            ? ((oraclePrice - pos.entryPrice) / (pos.entryPrice || 1)) * pos.size
                            : ((pos.entryPrice - oraclePrice) / (pos.entryPrice || 1)) * pos.size
                          : pos.pnl ?? null;

                      return (
                        <tr key={pos.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-3 font-semibold">
                            {pos.isLong ? (
                              <span className="text-emerald-400 font-orbitron flex items-center gap-1">
                                <ArrowUpRight size={12} /> LONG
                              </span>
                            ) : (
                              <span className="text-rose-400 font-orbitron flex items-center gap-1">
                                <ArrowDownRight size={12} /> SHORT
                              </span>
                            )}
                          </td>
                          <td className="py-3 font-mono text-white">{pos.leverage}x</td>
                          <td className="py-3 font-mono text-white">${fmt(pos.marginAmount)}</td>
                          <td className="py-3 font-mono text-white">${fmt(pos.size)}</td>
                          <td className="py-3 font-mono">
                            {livePnl !== null ? (
                              <span className={livePnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                {livePnl >= 0 ? "+" : ""}${fmt(livePnl)}
                              </span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="py-3 text-right">
                            <button
                              onClick={() => handleClosePosition(pos.posId)}
                              disabled={loading}
                              className="px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-all font-semibold font-orbitron disabled:opacity-50"
                            >
                              CLOSE
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
