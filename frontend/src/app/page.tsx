"use client";

import React, { useEffect, useState } from "react";
import { useWeb3 } from "@/context/Web3Context";
import { useRouter } from "next/navigation";
import { ShieldCheck, TrendingUp, HelpCircle, AlertCircle, Sparkles } from "lucide-react";

export default function LoginPage() {
  const { connect, connectMetaMask, address, isAuthenticated, loading, error } = useWeb3();
  const router = useRouter();
  const [selectedWalletIndex, setSelectedWalletIndex] = useState(0);

  // If already logged in, redirect straight to dashboard
  useEffect(() => {
    if (isAuthenticated) {
      router.push("/dashboard");
    }
  }, [isAuthenticated, router]);

  const mockWallets = [
    { name: "Account #1 (Retail User)", address: "0x1034...5E78", label: "General Trader" },
    { name: "Account #2 (Admin Device 2)", address: "0xF7c...0fD9", label: "Multisig Owner" },
    { name: "Account #3 (Admin Device 3)", address: "0xb45...0fD9", label: "Multisig Owner" },
    { name: "Account #0 (Super Deployer)", address: "0x1034...BE71", label: "Contract Creator" }
  ];

  const handleConnect = async () => {
    await connect(selectedWalletIndex);
  };

  const handleMetaMaskConnect = async () => {
    await connectMetaMask();
  };

  return (
    <main className="min-h-screen bg-[#03040b] flex flex-col justify-center items-center p-6 relative overflow-hidden">
      {/* Decorative Blur Orbs */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-500/10 rounded-full blur-[100px] -z-10"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[450px] h-[450px] bg-purple-500/10 rounded-full blur-[100px] -z-10"></div>

      <div className="w-full max-w-5xl grid md:grid-cols-12 gap-8 items-center">
        {/* Marketing / Hero Column */}
        <div className="md:col-span-7 flex flex-col gap-6 text-left">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-400 to-purple-600 flex items-center justify-center font-extrabold text-base tracking-wider font-orbitron">SX</div>
            <span className="font-orbitron font-extrabold text-2xl tracking-widest bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">DEFI TRADING</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-orbitron font-black leading-tight text-white">
            Next-Gen <span className="bg-gradient-to-r from-cyan-400 via-violet-400 to-purple-500 bg-clip-text text-transparent">Unified Margin</span> Terminal.
          </h1>

          <p className="text-slate-400 text-base md:text-lg leading-relaxed max-w-xl">
            Open cross-terminal derivatives with up to 1000x leverage, lock assets in dynamic yield lending pools, trade leveraged spot tokens with auto TP/SL executions, and execute ZK-proof hidden orders.
          </p>

          <div className="grid grid-cols-2 gap-4 mt-2">
            <div className="glass-panel p-4 rounded-xl flex flex-col gap-1 border border-white/5">
              <span className="text-cyan-400 font-orbitron font-bold text-lg">2x - 1000x</span>
              <span className="text-xs text-slate-500 uppercase tracking-wider">Perpetuals</span>
            </div>
            <div className="glass-panel p-4 rounded-xl flex flex-col gap-1 border border-white/5">
              <span className="text-purple-400 font-orbitron font-bold text-lg">250% LTV</span>
              <span className="text-xs text-slate-500 uppercase tracking-wider">Safety lending ratio</span>
            </div>
          </div>
        </div>

        {/* SIWE Wallet Signing Column */}
        <div className="md:col-span-5">
          <div className="glass-panel p-8 rounded-2xl border border-white/10 flex flex-col gap-6 relative">
            <div className="flex flex-col gap-2">
              <h2 className="font-orbitron font-bold text-xl text-white">Access Terminal</h2>
              <p className="text-xs text-slate-400">Connect your Web3 MetaMask wallet or select a mock developer key.</p>
            </div>

            {/* MetaMask Button */}
            <button
              onClick={handleMetaMaskConnect}
              disabled={loading}
              className="w-full py-4 rounded-xl bg-orange-500/10 border border-orange-500/30 hover:bg-orange-500/20 text-orange-400 font-orbitron font-bold text-sm tracking-wide flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <Sparkles size={16} />
              <span>CONNECT METAMASK</span>
            </button>

            <div className="flex items-center gap-3 text-slate-600 my-1 text-xs">
              <div className="h-[1px] bg-white/5 flex-1"></div>
              <span>OR DEVELOPER KEYS</span>
              <div className="h-[1px] bg-white/5 flex-1"></div>
            </div>

            {/* Wallet Selection Selector */}
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-col gap-2">
                {mockWallets.map((wallet, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedWalletIndex(index)}
                    className={`flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${selectedWalletIndex === index ? "bg-cyan-500/10 border-cyan-400 text-white" : "bg-white/5 border-white/5 text-slate-400 hover:bg-white/10"}`}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold">{wallet.name}</span>
                      <span className="text-[10px] font-mono text-slate-500">{wallet.address}</span>
                    </div>
                    <span className={`text-[10px] font-bold font-orbitron uppercase px-2 py-0.5 rounded ${selectedWalletIndex === index ? "bg-cyan-500/20 text-cyan-400" : "bg-white/5 text-slate-500"}`}>
                      {wallet.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs p-3.5 rounded-xl flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handleConnect}
              disabled={loading}
              className="w-full py-4 rounded-xl glow-btn-cyan text-slate-950 font-orbitron font-bold text-sm tracking-wide flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                  <span>Signing Challenge...</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>SIGN IN WITH SELECTED KEY</span>
                </>
              )}
            </button>

            <div className="text-[10px] text-slate-500 text-center flex items-center justify-center gap-1.5 mt-2">
              <ShieldCheck size={12} className="text-cyan-500" />
              <span>Cryptographically secured session token storage active.</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
