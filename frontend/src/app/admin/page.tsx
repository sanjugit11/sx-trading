"use client";

import React, { useState, useEffect, useCallback } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { useWeb3 } from "@/context/Web3Context";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Play,
  Pause,
  RefreshCw,
  CheckCircle2,
  Clock,
  Zap,
  Lock,
  Unlock
} from "lucide-react";
import axios from "axios";
import { ethers } from "ethers";
import { CONTRACT_ADDRESSES, CONTRACT_ABIS } from "@/blockchain/config";

// The 4-byte selector for activateKillSwitch() and deactivateKillSwitch()
// keccak256("activateKillSwitch()")[0:4]
const ACTIVATE_SELECTOR = "0xf24e7fd9";
// keccak256("deactivateKillSwitch()")[0:4]
const DEACTIVATE_SELECTOR = "0x911f57dd";

interface Proposal {
  id: number;
  target: string;
  approvals: number;
  executed: boolean;
  label?: string;
}

type KillSwitchStep = "idle" | "creating" | "approving" | "done";

export default function AdminPage() {
  const { token, sendTransaction, address } = useWeb3();

  // Proposal form state
  const [proposalTarget, setProposalTarget] = useState(CONTRACT_ADDRESSES.sxadmin);
  const [proposalData, setProposalData] = useState("0x");
  const [proposals, setProposals] = useState<Proposal[]>([]);

  // Kill switch state (from on-chain via backend)
  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const [killSwitchLoading, setKillSwitchLoading] = useState(false);
  const [killSwitchStep, setKillSwitchStep] = useState<KillSwitchStep>("idle");
  const [killSwitchStepMsg, setKillSwitchStepMsg] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Poll on-chain kill switch state
  const fetchKillSwitchStatus = useCallback(async () => {
    try {
      const res = await axios.get("/api/admin/status");
      setKillSwitchActive(res.data.killSwitchActive === true);
    } catch {
      // Non-fatal
    }
  }, []);

  // Fetch proposals from SXAdmin on-chain
  const loadProposals = useCallback(async () => {
    try {
      const provider = new ethers.JsonRpcProvider("https://rpc.hoodi.ethpandaops.io");
      const contract = new ethers.Contract(CONTRACT_ADDRESSES.sxadmin, CONTRACT_ABIS.sxadmin, provider);
      const counter = await contract.proposalCounter();
      const count = Number(counter);

      const loaded: Proposal[] = [];
      for (let i = 1; i <= count; i++) {
        const prop = await contract.proposals(BigInt(i));
        const id = Number(prop[0]);
        const target = prop[1];
        const data = prop[2];
        const approvals = Number(prop[3]);
        const executed = prop[4];

        let label: string | undefined = undefined;
        if (data.toLowerCase().startsWith(ACTIVATE_SELECTOR.toLowerCase())) {
          label = "Activate Kill Switch";
        } else if (data.toLowerCase().startsWith(DEACTIVATE_SELECTOR.toLowerCase())) {
          label = "Deactivate Kill Switch";
        }

        loaded.push({
          id,
          target,
          approvals,
          executed,
          label
        });
      }
      setProposals(loaded);
    } catch (err) {
      console.error("Failed to load proposals:", err);
    }
  }, []);

  useEffect(() => {
    fetchKillSwitchStatus();
    loadProposals();
    const interval = setInterval(() => {
      fetchKillSwitchStatus();
      loadProposals();
    }, 10_000);
    return () => clearInterval(interval);
  }, [fetchKillSwitchStatus, loadProposals]);

  /**
   * Emergency Kill Switch flow:
   *  1. Create a proposal targeting sxadmin itself with the activate/deactivate calldata
   *  2. Approve it (counts as 1/3)
   *
   * The remaining approvals (2/3 and 3/3) and execution must be performed manually
   * by the other master devices using the proposals list panel.
   */
  const handleEmergencyKillSwitch = async () => {
    if (!token) return;
    setKillSwitchLoading(true);
    setError(null);
    setSuccess(null);

    const isActivating = !killSwitchActive;
    const calldata = isActivating ? ACTIVATE_SELECTOR : DEACTIVATE_SELECTOR;
    const action = isActivating ? "Activate" : "Deactivate";

    try {
      // Step 1: Create Proposal
      setKillSwitchStep("creating");
      setKillSwitchStepMsg(`Step 1/2: Creating ${action} Kill Switch proposal on-chain…`);

      const createReceipt = await sendTransaction(
        CONTRACT_ADDRESSES.sxadmin,
        CONTRACT_ABIS.sxadmin,
        "createProposal",
        [CONTRACT_ADDRESSES.sxadmin, calldata]
      );

      // Parse the real proposalId from emitted event
      let proposalId: number | null = null;
      if (createReceipt?.logs) {
        const iface = new ethers.Interface(CONTRACT_ABIS.sxadmin);
        for (const log of createReceipt.logs) {
          try {
            const parsed = iface.parseLog(log);
            if (parsed?.name === "ProposalCreated") {
              proposalId = Number(parsed.args.proposalId);
              break;
            }
          } catch { /* skip */ }
        }
      }
      if (proposalId === null) proposalId = proposals.length + 1;

      // Step 2: Approve Proposal (this wallet = 1 master device, counts as 1/3)
      setKillSwitchStep("approving");
      setKillSwitchStepMsg(`Step 2/2: Approving proposal #${proposalId} (1/3 consensus)…`);

      await sendTransaction(
        CONTRACT_ADDRESSES.sxadmin,
        CONTRACT_ABIS.sxadmin,
        "approveProposal",
        [BigInt(proposalId)]
      );

      setKillSwitchStep("done");
      setSuccess(
        `MultiSig Proposal #${proposalId} to ${action} Kill Switch created and approved (1/3). ` +
        `Two more master devices must approve this proposal before it can be executed.`
      );

      // Refresh state
      await loadProposals();
      await fetchKillSwitchStatus();
    } catch (err: any) {
      console.error(err);
      setError(err?.reason || err?.message || "Transaction failed");
    } finally {
      setKillSwitchLoading(false);
      setKillSwitchStep("idle");
      setKillSwitchStepMsg("");
    }
  };

  const handleCreateProposal = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const createReceipt = await sendTransaction(
        CONTRACT_ADDRESSES.sxadmin,
        CONTRACT_ABIS.sxadmin,
        "createProposal",
        [proposalTarget, proposalData]
      );

      let proposalId: number | null = null;
      if (createReceipt?.logs) {
        const iface = new ethers.Interface(CONTRACT_ABIS.sxadmin);
        for (const log of createReceipt.logs) {
          try {
            const parsed = iface.parseLog(log);
            if (parsed?.name === "ProposalCreated") {
              proposalId = Number(parsed.args.proposalId);
              break;
            }
          } catch { /* skip */ }
        }
      }

      setSuccess(`MultiSig Proposal #${proposalId || "created"} created on-chain successfully!`);
      await loadProposals();
    } catch (err: any) {
      setError(err?.reason || err.message || "Failed to create proposal on-chain");
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
      await sendTransaction(
        CONTRACT_ADDRESSES.sxadmin,
        CONTRACT_ABIS.sxadmin,
        "approveProposal",
        [BigInt(id)]
      );

      setSuccess(`Proposal #${id} approved successfully!`);
      await loadProposals();
    } catch (err: any) {
      setError(err?.reason || err.message || "Failed to approve proposal on-chain");
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
    if (!prop) { setLoading(false); return; }

    if (prop.approvals < 3) {
      setError("Cannot execute: 3/3 master device approvals required.");
      setLoading(false);
      return;
    }

    try {
      await sendTransaction(
        CONTRACT_ADDRESSES.sxadmin,
        CONTRACT_ABIS.sxadmin,
        "executeProposal",
        [BigInt(id)]
      );

      setSuccess(`Proposal #${id} executed successfully on-chain!`);
      await loadProposals();
      await fetchKillSwitchStatus();
    } catch (err: any) {
      setError(err?.reason || err.message || "Failed to execute proposal on-chain");
    } finally {
      setLoading(false);
    }
  };

  const stepLabels: Record<KillSwitchStep, string> = {
    idle: "",
    creating: "Creating Proposal…",
    approving: "Approving (1/3)…",
    done: "Done!"
  };

  return (
    <DashboardShell>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Panel: Kill Switch + Proposal Form */}
        <div className="lg:col-span-6 flex flex-col gap-6">

          {/* ── Emergency Kill Switch Card ── */}
          <div className={`glass-panel p-6 rounded-2xl border flex flex-col gap-5 transition-all ${
            killSwitchActive
              ? "border-rose-500/40 shadow-[0_0_30px_rgba(239,68,68,0.15)]"
              : "border-white/5"
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert
                  size={20}
                  className={killSwitchActive ? "text-rose-400 animate-pulse" : "text-amber-400"}
                />
                <h3 className="font-orbitron font-bold text-base text-white">Emergency Kill Switch</h3>
              </div>
              <button
                onClick={fetchKillSwitchStatus}
                title="Refresh on-chain state"
                className="p-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-all"
              >
                <RefreshCw size={12} className="text-cyan-400" />
              </button>
            </div>

            {/* Status pill */}
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-orbitron font-bold ${
                killSwitchActive
                  ? "bg-rose-500/15 border-rose-500/30 text-rose-400"
                  : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              }`}>
                {killSwitchActive ? <Lock size={12} /> : <Unlock size={12} />}
                <span>{killSwitchActive ? "PROTOCOL HALTED" : "PROTOCOL ACTIVE"}</span>
              </div>
              <span className="text-[10px] text-slate-500">On-chain state (polling every 10s)</span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Triggering this emergency switch pauses deposits, borrows, perpetual, and spot
              operations on-chain by executing an <code className="text-cyan-400 bg-cyan-500/10 px-1 rounded">activateKillSwitch()</code> proposal
              through the SXAdmin MultiSig. Requires 3/3 master device consensus on mainnet.
            </p>

            {/* Step progress (shown during operation) */}
            {killSwitchLoading && killSwitchStep !== "idle" && (
              <div className="bg-[#05060f]/80 rounded-xl border border-white/5 p-4 flex flex-col gap-3">
                <div className="text-xs text-slate-300 font-semibold font-orbitron">{killSwitchStepMsg}</div>
                <div className="flex gap-2">
                  {(["creating", "approving"] as const).map((step, i) => {
                    const steps: KillSwitchStep[] = ["creating", "approving", "done"];
                    const currentIdx = steps.indexOf(killSwitchStep);
                    const stepIdx = i;
                    return (
                      <div
                        key={step}
                        className={`flex-1 h-1.5 rounded-full transition-all ${
                          stepIdx < currentIdx
                            ? "bg-emerald-400"
                            : stepIdx === currentIdx
                            ? "bg-cyan-400 animate-pulse"
                            : "bg-white/10"
                        }`}
                      />
                    );
                  })}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  Flow: createProposal → approveProposal (1/3)
                </div>
              </div>
            )}

            <button
              onClick={handleEmergencyKillSwitch}
              disabled={killSwitchLoading || !token}
              className={`w-full py-4 rounded-xl font-orbitron font-bold text-sm tracking-wider flex items-center justify-center gap-2 border transition-all cursor-pointer disabled:opacity-50 ${
                killSwitchActive
                  ? "bg-emerald-500/10 border-emerald-400/50 text-emerald-400 hover:bg-emerald-500/15"
                  : "bg-rose-500/10 border-rose-400/50 text-rose-400 hover:bg-rose-500/15 animate-pulse"
              }`}
            >
              {killSwitchLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>{stepLabels[killSwitchStep] || "Processing…"}</span>
                </>
              ) : killSwitchActive ? (
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

            {!token && (
              <p className="text-[10px] text-rose-400 text-center">
                Connect wallet to trigger kill switch
              </p>
            )}
          </div>

          {/* ── Proposal Form ── */}
          <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col gap-5">
            <div className="flex items-center gap-2">
              <ShieldCheck size={20} className="text-cyan-400" />
              <h3 className="font-orbitron font-bold text-base text-white">Create Governance Proposal</h3>
            </div>

            {/* Calldata presets */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-500 uppercase font-orbitron tracking-wider">Quick Presets</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Activate Kill Switch", data: ACTIVATE_SELECTOR, target: CONTRACT_ADDRESSES.sxadmin },
                  { label: "Deactivate Kill Switch", data: DEACTIVATE_SELECTOR, target: CONTRACT_ADDRESSES.sxadmin },
                ].map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => { setProposalData(preset.data); setProposalTarget(preset.target); }}
                    className={`py-2 px-3 rounded-lg text-[10px] font-orbitron border transition-all text-left ${
                      proposalData === preset.data
                        ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-400"
                        : "bg-white/5 border-white/5 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Zap size={10} className="inline mr-1" />
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-500 uppercase font-orbitron tracking-wider">Target Contract Address</label>
              <input
                type="text"
                value={proposalTarget}
                onChange={(e) => setProposalTarget(e.target.value)}
                className="w-full bg-[#05060f] border border-white/5 rounded-xl py-3 px-4 text-xs font-mono text-white focus:outline-none focus:border-cyan-400/50"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-500 uppercase font-orbitron tracking-wider">Payload Calldata (hex)</label>
              <input
                type="text"
                value={proposalData}
                onChange={(e) => setProposalData(e.target.value)}
                className="w-full bg-[#05060f] border border-white/5 rounded-xl py-3 px-4 text-xs font-mono text-white focus:outline-none focus:border-cyan-400/50"
                placeholder="0x..."
              />
            </div>

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs p-3.5 rounded-xl flex items-start gap-2">
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            {success && (
              <div className="bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs p-3.5 rounded-xl flex items-start gap-2">
                <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
                <span className="leading-relaxed">{success}</span>
              </div>
            )}

            <button
              onClick={handleCreateProposal}
              disabled={loading || !token}
              className="w-full py-4 rounded-xl glow-btn-cyan text-slate-950 font-orbitron font-bold text-sm tracking-wider cursor-pointer disabled:opacity-50"
            >
              {loading ? "CONFIRMING IN WALLET..." : "SUBMIT GOVERNANCE PROPOSAL"}
            </button>
          </div>
        </div>

        {/* Right Panel: Proposals List */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h3 className="font-orbitron font-bold text-base text-white">Active MultiSig Proposals</h3>
              <span className="text-[10px] text-slate-500 font-mono">{proposals.length} proposal{proposals.length !== 1 ? "s" : ""}</span>
            </div>
            <p className="text-xs text-slate-400">
              Consensus requires <span className="text-cyan-400 font-bold">3/3</span> master device approvals before execution.
            </p>

            {proposals.length === 0 ? (
              <div className="py-10 flex flex-col items-center gap-3 text-slate-600">
                <ShieldCheck size={32} />
                <span className="text-xs font-orbitron">No proposals yet</span>
              </div>
            ) : (
              <div className="flex flex-col gap-3 mt-2">
                {proposals.map((prop) => (
                  <div
                    key={prop.id}
                    className={`bg-white/5 p-4 rounded-xl border flex flex-col gap-3 transition-all ${
                      prop.executed
                        ? "border-emerald-500/20 opacity-60"
                        : prop.approvals >= 3
                        ? "border-cyan-500/20"
                        : "border-white/5"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-orbitron font-bold text-xs text-slate-200 block">
                          Proposal #{prop.id}
                          {prop.label && (
                            <span className="ml-2 text-[10px] text-amber-400 font-normal bg-amber-500/10 px-1.5 py-0.5 rounded">
                              {prop.label}
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono block mt-0.5 truncate max-w-[200px]">
                          {prop.target}
                        </span>
                      </div>
                      <span className={`text-xs font-orbitron font-bold ${
                        prop.approvals >= 3 ? "text-emerald-400" : "text-cyan-400"
                      }`}>
                        {prop.approvals}/3 APPROVED
                      </span>
                    </div>

                    {/* Approval progress bar */}
                    <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          prop.approvals >= 3 ? "bg-emerald-400" : "bg-cyan-400"
                        }`}
                        style={{ width: `${(prop.approvals / 3) * 100}%` }}
                      />
                    </div>

                    {prop.executed ? (
                      <div className="flex items-center gap-2 text-[10px] text-emerald-400 font-orbitron">
                        <CheckCircle2 size={12} />
                        <span>EXECUTED ON-CHAIN</span>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApproveProposal(prop.id)}
                          disabled={loading || prop.approvals >= 3}
                          className="px-3 py-1.5 rounded bg-white/5 border border-white/5 text-[10px] font-bold font-orbitron text-slate-300 hover:bg-white/10 transition-all disabled:opacity-50 flex items-center gap-1"
                        >
                          <Clock size={10} />
                          APPROVE
                        </button>
                        <button
                          onClick={() => handleExecuteProposal(prop.id)}
                          disabled={loading || prop.approvals < 3}
                          className="px-3 py-1.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-bold font-orbitron text-cyan-400 hover:bg-cyan-500/20 transition-all disabled:opacity-50 flex items-center gap-1"
                        >
                          <Zap size={10} />
                          EXECUTE
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info card explaining on-chain flow */}
          <div className="glass-panel p-5 rounded-2xl border border-white/5 flex flex-col gap-3">
            <h4 className="text-xs font-orbitron font-bold text-slate-300 flex items-center gap-2">
              <ShieldCheck size={14} className="text-cyan-400" />
              Kill Switch On-Chain Flow
            </h4>
            <ol className="flex flex-col gap-2 text-[11px] text-slate-400 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold font-mono w-4 flex-shrink-0">1.</span>
                <span><code className="text-cyan-400 bg-cyan-500/10 px-1 rounded">createProposal(sxadmin, 0xf24e7fd9)</code> — encodes <code className="text-slate-300">activateKillSwitch()</code> selector targeting SXAdmin itself</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold font-mono w-4 flex-shrink-0">2.</span>
                <span><code className="text-cyan-400 bg-cyan-500/10 px-1 rounded">approveProposal(id)</code> — called by each of 3 master device wallets (3/3 required)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold font-mono w-4 flex-shrink-0">3.</span>
                <span><code className="text-cyan-400 bg-cyan-500/10 px-1 rounded">executeProposal(id)</code> — calls <code className="text-slate-300">activateKillSwitch()</code> via <code className="text-slate-300">address(this).call</code>, pausing SXPT, SXLT, SXLS</span>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
