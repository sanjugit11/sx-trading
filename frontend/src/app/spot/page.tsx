"use client";

import React, { useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { useWeb3 } from "@/context/Web3Context";
import { ArrowUpRight, ShieldCheck, AlertTriangle } from "lucide-react";
import axios from "axios";
import { ethers } from "ethers";
import { CONTRACT_ADDRESSES, CONTRACT_ABIS } from "@/blockchain/config";

export default function SpotPage() {
  const { token, sendTransaction, address } = useWeb3();
  const [targetAsset, setTargetAsset] = useState("0x2c75e12798e1648058F90E14baB1F1Eef3e4Fdf7"); // MockUSDT
  const [collateralAmount, setCollateralAmount] = useState(100);
  const [leverage, setLeverage] = useState(3);
  const [isLimit, setIsLimit] = useState(false);
  const [triggerPrice, setTriggerPrice] = useState(1.0);
  const [takeProfit, setTakeProfit] = useState(1.2);
  const [spots, setSpots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleOpenSpot = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const receipt = await sendTransaction(
        CONTRACT_ADDRESSES.sxls,
        CONTRACT_ABIS.sxls,
        "openLeveragedSpot",
        [
          targetAsset,
          ethers.parseEther(collateralAmount.toString()),
          BigInt(leverage),
          isLimit,
          ethers.parseEther(triggerPrice.toString())
        ]
      );

      const res = await axios.post("http://localhost:3000/api/spot/open", {
        targetAsset,
        collateralAmount,
        leverage,
        isLimit,
        triggerPrice: isLimit ? triggerPrice : undefined
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const createdSpot = res.data.spot;
      setSpots((prev) => [
        {
          ...createdSpot,
          txHash: receipt?.hash || null
        },
        ...prev
      ]);
      setSuccess(isLimit ? "Limit Spot Order queued successfully!" : "Market Spot position opened!");
    } catch (err: any) {
      setError(err.message || "Failed to initiate spot position on-chain");
    } finally {
      setLoading(false);
    }
  };

  const handleSetTakeProfit = async (spot: any) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const readProvider = new ethers.JsonRpcProvider("https://rpc.hoodi.ethpandaops.io");
      const readContract = new ethers.Contract(CONTRACT_ADDRESSES.sxls, CONTRACT_ABIS.sxls, readProvider);
      const onChainPosition = await readContract.positions(spot.posId);

      if (!onChainPosition.isOpen) {
        setSpots((prev) => prev.map((entry) => entry.posId === spot.posId ? { ...entry, isOpen: false } : entry));
        setError(`Spot #${spot.posId} is no longer open on-chain. It may already have been closed.`);
        setLoading(false);
        return;
      }

      await sendTransaction(
        CONTRACT_ADDRESSES.sxls,
        CONTRACT_ABIS.sxls,
        "updateTakeProfit",
        [BigInt(spot.posId), ethers.parseEther(takeProfit.toString())]
      );

      setSuccess(`Take-profit set to $${takeProfit} for spot #${spot.posId}.`);
      setSpots((prev) => prev.map((entry) => entry.posId === spot.posId ? { ...entry, takeProfit } : entry));
    } catch (err: any) {
      setError(err.message || "Failed to set take-profit");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardShell>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Spot Order form: 6 columns */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col gap-6">
            <h3 className="font-orbitron font-bold text-base text-white">Initiate Leveraged Spot Order</h3>

            {/* Order Type Tabs */}
            <div className="grid grid-cols-2 bg-[#05060f] p-1.5 rounded-xl border border-white/5">
              <button
                onClick={() => setIsLimit(false)}
                className={`py-2 rounded-lg text-xs font-semibold font-orbitron transition-all ${!isLimit ? "bg-white/5 text-cyan-400 border border-white/5" : "text-slate-500 hover:text-slate-300"}`}
              >
                MARKET ORDER
              </button>
              <button
                onClick={() => setIsLimit(true)}
                className={`py-2 rounded-lg text-xs font-semibold font-orbitron transition-all ${isLimit ? "bg-white/5 text-cyan-400 border border-white/5" : "text-slate-500 hover:text-slate-300"}`}
              >
                LIMIT ORDER
              </button>
            </div>

            {/* Collateral Lock */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-500 uppercase font-orbitron tracking-wider">Collateral locked</label>
              <div className="relative">
                <input
                  type="number"
                  value={collateralAmount}
                  onChange={(e) => setCollateralAmount(Number(e.target.value))}
                  className="w-full bg-[#05060f] border border-white/5 rounded-xl py-3 px-4 text-sm font-mono text-white focus:outline-none focus:border-cyan-400/50"
                />
                <span className="absolute right-4 top-3.5 text-xs text-slate-500 font-orbitron">USD</span>
              </div>
            </div>

            {/* Leverage Input */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-500 uppercase font-orbitron tracking-wider">Spot Leverage multiplier (1x - 10x)</label>
              <input
                type="number"
                min="1"
                max="10"
                value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value))}
                className="w-full bg-[#05060f] border border-white/5 rounded-xl py-3 px-4 text-sm font-mono text-white focus:outline-none focus:border-cyan-400/50"
              />
            </div>

            {/* Limit Price Trigger */}
            {isLimit && (
              <div className="flex flex-col gap-2 animate-fadeIn">
                <label className="text-xs text-slate-500 uppercase font-orbitron tracking-wider">Trigger execution limit price</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    value={triggerPrice}
                    onChange={(e) => setTriggerPrice(Number(e.target.value))}
                    className="w-full bg-[#05060f] border border-white/5 rounded-xl py-3 px-4 text-sm font-mono text-white focus:outline-none focus:border-cyan-400/50"
                  />
                  <span className="absolute right-4 top-3.5 text-xs text-slate-500 font-orbitron">USD</span>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-500 uppercase font-orbitron tracking-wider">Take-profit target</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(Number(e.target.value))}
                  className="w-full bg-[#05060f] border border-white/5 rounded-xl py-3 px-4 text-sm font-mono text-white focus:outline-none focus:border-cyan-400/50"
                />
                <span className="absolute right-4 top-3.5 text-xs text-slate-500 font-orbitron">USD</span>
              </div>
            </div>

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs p-3.5 rounded-xl flex items-center gap-2">
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs p-3.5 rounded-xl flex items-center gap-2">
                <ShieldCheck size={16} />
                <span>{success}</span>
              </div>
            )}

            <button
              onClick={handleOpenSpot}
              disabled={loading}
              className="w-full py-4 rounded-xl glow-btn-cyan text-slate-950 font-orbitron font-bold text-sm tracking-wider cursor-pointer"
            >
              {loading ? "CONFIRMING IN WALLET..." : (isLimit ? "SUBMIT LIMIT ORDER" : "EXECUTE MARKET SPOT")}
            </button>
          </div>
        </div>

        {/* Spot Audit logs panel: 6 columns */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
            <h3 className="font-orbitron font-bold text-base text-white">Pending Spot Orderbook</h3>
            <p className="text-xs text-slate-400">Limit spots wait on-chain until matching price indices are hit.</p>

            <div className="flex flex-col gap-2 mt-2">
              {spots.length === 0 ? (
                <span className="text-xs text-slate-500 italic">No spot orders logged in this session.</span>
              ) : (
                spots.map((spot, idx) => (
                  <div key={idx} className="bg-white/5 p-3 rounded-lg flex flex-col gap-2 text-xs">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-semibold block text-slate-200">Spot #{spot.posId}</span>
                        <span className="text-[10px] text-slate-500">Size: ${spot.size} | Mode: {spot.isLimit ? `Limit @ $${spot.triggerPrice}` : "Market"}</span>
                      </div>
                      <span className={`text-[10px] font-orbitron font-bold uppercase px-2 py-0.5 rounded ${spot.isPending ? "bg-amber-500/10 text-amber-400" : spot.isOpen === false ? "bg-slate-500/10 text-slate-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                        {spot.isOpen === false ? "CLOSED" : spot.isPending ? "PENDING" : "OPENED"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">TP: ${spot.takeProfit ?? takeProfit}</span>
                      <button
                        onClick={() => handleSetTakeProfit(spot)}
                        disabled={loading || spot.isOpen === false}
                        className="px-2.5 py-1 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 transition-all font-semibold font-orbitron disabled:opacity-50"
                      >
                        {spot.isOpen === false ? "CLOSED" : "SET TP"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
