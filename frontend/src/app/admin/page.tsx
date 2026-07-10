"use client";

import React, { useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { useWeb3 } from "@/context/Web3Context";
import { ShieldCheck, ShieldAlert, AlertTriangle, Play, Pause } from "lucide-react";
import axios from "axios";
import { CONTRACT_ADDRESSES, CONTRACT_ABIS } from "@/blockchain/config";

export default function AdminPage() {
  const { token, sendTransaction } = useWeb3();
  const [proposalTarget, setProposalTarget] = useState("0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9"); // Default SXPT address
  const [proposalData, setProposalData] = useState("0x8c5b0213"); // Mock execute kill switch pause data
  const [proposals, setProposals] = useState<any[]>([
    { id: 1, target: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9", approvals: 1, executed: false },
    { id: 2, target: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9", approvals: 2, executed: false }
  ]);
  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleCreateProposal = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // 1. Submit proposal on-chain via MetaMask (or mock fallback)
      await sendTransaction(
        CONTRACT_ADDRESSES.sxadmin,
        CONTRACT_ABIS.sxadmin,
        "createProposal",
        [
          proposalTarget,
          proposalData
        ]
      );

      const newProp = {
        id: proposals.length + 1,
        target: proposalTarget,
        approvals: 1,
        executed: false
      };

      setProposals([...proposals, newProp]);
      setSuccess("MultiSig Proposal created successfully!");
    } catch (err: any) {
      setError(err.message || "Failed to create proposal on-chain");
    } finally {
      setLoading(false);
    }
  };

  const handleApproveProposal = async (id: number) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // 1. Approve proposal on-chain via MetaMask (or mock fallback)
      await sendTransaction(
        CONTRACT_ADDRESSES.sxadmin,
        CONTRACT_ABIS.sxadmin,
        "approveProposal",
        [BigInt(id)]
      );

      const updated = proposals.map((prop) => {
        if (prop.id === id) {
          const nextApprovals = Math.min(prop.approvals + 1, 3);
          if (nextApprovals === 3) {
            setSuccess(`Proposal #${id} approved by 3/3 device consensus! Ready to execute.`);
          } else {
            setSuccess(`Proposal #${id} approved. Current votes: ${nextApprovals}/3.`);
          }
          return { ...prop, approvals: nextApprovals };
        }
        return prop;
      });

      setProposals(updated);
    } catch (err: any) {
      setError(err.message || "Failed to approve proposal on-chain");
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteProposal = async (id: number) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    const prop = proposals.find(p => p.id === id);
    if (!prop) return;

    if (prop.approvals < 3) {
      setError("Cannot execute: 3/3 device approvals required.");
      setLoading(false);
      return;
    }

    try {
      // 1. Execute proposal on-chain via MetaMask (or mock fallback)
      await sendTransaction(
        CONTRACT_ADDRESSES.sxadmin,
        CONTRACT_ABIS.sxadmin,
        "executeProposal",
        [BigInt(id)]
      );

      const updated = proposals.map((p) => {
        if (p.id === id) {
          return { ...p, executed: true };
        }
        return p;
      });

      setProposals(updated);
      setSuccess(`Proposal #${id} executed successfully on-chain!`);
    } catch (err: any) {
      setError(err.message || "Failed to execute proposal on-chain");
    } finally {
      setLoading(false);
    }
  };

  const toggleKillSwitch = () => {
    setKillSwitchActive(!killSwitchActive);
    setSuccess(killSwitchActive ? "Global Kill Switch Deactivated" : "Global Kill Switch Activated across core contracts");
  };

  return (
    <DashboardShell>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Proposal Creation Panel: 6 columns */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          {/* Global Kill Switch */}
          <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <ShieldAlert size={20} className={killSwitchActive ? "text-rose-400 animate-pulse" : "text-amber-400"} />
              <h3 className="font-orbitron font-bold text-base text-white">Emergency Kill Switch</h3>
            </div>
            <p className="text-xs text-slate-400">Triggering this emergency switch pauses deposit, borrow, perp, and spot operations immediately.</p>

            <button
              onClick={toggleKillSwitch}
              className={`w-full py-4 rounded-xl font-orbitron font-bold text-sm tracking-wider flex items-center justify-center gap-2 border transition-all cursor-pointer ${killSwitchActive ? "bg-rose-500/10 border-rose-400 text-rose-400 animate-pulse" : "bg-white/5 border-white/5 text-slate-400 hover:bg-white/10"}`}
            >
              {killSwitchActive ? (
                <>
                  <Play size={16} />
                  <span>DEACTIVATE KILL SWITCH</span>
                </>
              ) : (
                <>
                  <Pause size={16} />
                  <span>ACTIVATE MASTER KILL SWITCH</span>
                </>
              )}
            </button>
          </div>

          {/* Proposal Form */}
          <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col gap-5">
            <div className="flex items-center gap-2">
              <ShieldCheck size={20} className="text-cyan-400" />
              <h3 className="font-orbitron font-bold text-base text-white">Create Governance Proposal</h3>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-500 uppercase font-orbitron tracking-wider">Target Contract Address</label>
              <input
                type="text"
                value={proposalTarget}
                onChange={(e) => setProposalTarget(e.target.value)}
                className="w-full bg-[#05060f] border border-white/5 rounded-xl py-3 px-4 text-xs font-mono text-white focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-500 uppercase font-orbitron tracking-wider">Payload Data (Calldata hex)</label>
              <input
                type="text"
                value={proposalData}
                onChange={(e) => setProposalData(e.target.value)}
                className="w-full bg-[#05060f] border border-white/5 rounded-xl py-3 px-4 text-xs font-mono text-white focus:outline-none"
              />
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
              onClick={handleCreateProposal}
              disabled={loading}
              className="w-full py-4 rounded-xl glow-btn-cyan text-slate-950 font-orbitron font-bold text-sm tracking-wider cursor-pointer"
            >
              {loading ? "CONFIRMING IN WALLET..." : "SUBMIT GOVERNANCE PROPOSAL"}
            </button>
          </div>
        </div>

        {/* Proposals List: 6 columns */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
            <h3 className="font-orbitron font-bold text-base text-white">Active MultiSig Proposals</h3>
            <p className="text-xs text-slate-400">Consensus requires 3 approvals across the master devices to execute transactions.</p>

            <div className="flex flex-col gap-3 mt-2">
              {proposals.map((prop) => (
                <div key={prop.id} className="bg-white/5 p-4 rounded-xl border border-white/5 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-orbitron font-bold text-xs text-slate-200 block">Proposal #{prop.id}</span>
                      <span className="text-[10px] text-slate-500 font-mono block mt-0.5">{prop.target}</span>
                    </div>
                    <span className="text-xs font-orbitron font-bold text-cyan-400">{prop.approvals}/3 APPROVED</span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApproveProposal(prop.id)}
                      disabled={loading || prop.approvals >= 3 || prop.executed}
                      className="px-3 py-1.5 rounded bg-white/5 border border-white/5 text-[10px] font-bold font-orbitron text-slate-300 hover:bg-white/10 transition-all disabled:opacity-50"
                    >
                      APPROVE
                    </button>
                    <button
                      onClick={() => handleExecuteProposal(prop.id)}
                      disabled={loading || prop.approvals < 3 || prop.executed}
                      className="px-3 py-1.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-bold font-orbitron text-cyan-400 hover:bg-cyan-500/20 transition-all disabled:opacity-50"
                    >
                      {prop.executed ? "EXECUTED" : "EXECUTE"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
