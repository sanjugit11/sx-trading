"use client";

import React, { useState, useEffect, useCallback } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { useWeb3 } from "@/context/Web3Context";
import {
  Server,
  RefreshCw,
  Database,
  Cpu,
  Clock,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Play,
  Terminal as TerminalIcon,
  HelpCircle
} from "lucide-react";
import axios from "axios";

interface IndexerLog {
  timestamp: string;
  type: "info" | "error" | "warn";
  message: string;
}

interface IndexerStatus {
  status: string;
  lastProcessedBlock: number;
  latestBlock: number;
  pollIntervalMs: number;
  lastPollTime: string;
  logs: IndexerLog[];
}

export default function IndexerPage() {
  const { token } = useWeb3();
  const [status, setStatus] = useState<IndexerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<{ polled: boolean; count?: number; error?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Stats from DB for extra premium detail
  const [dbStats, setDbStats] = useState({
    perps: 0,
    loans: 0,
    spots: 0
  });

  const fetchStatus = useCallback(async () => {
    try {
      const res = await axios.get("/api/indexer/status");
      setStatus(res.data);
      setError(null);
    } catch (err: any) {
      setError("Failed to connect to indexer API service.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDbStats = useCallback(async () => {
    try {
      // We can query user profile/dashboard metrics or custom endpoints
      const res = await axios.get("/api/dashboard", {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Infer counts from active lists
      if (res.data) {
        setDbStats({
          perps: res.data.activePerpetuals?.length || 0,
          loans: res.data.activeLoans?.length || 0,
          spots: res.data.activeSpots?.length || 0
        });
      }
    } catch {
      // Fail silently for supplementary stats
    }
  }, [token]);

  // Initial load + interval polling for logs
  useEffect(() => {
    fetchStatus();
    if (token) {
      fetchDbStats();
    }
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchDbStats, token]);

  const handleManualTrigger = async () => {
    setTriggering(true);
    setTriggerResult(null);
    try {
      const res = await axios.post("/api/indexer/trigger");
      if (res.data.success) {
        setTriggerResult({
          polled: res.data.polled,
          count: res.data.count
        });
        fetchStatus();
        fetchDbStats();
      } else {
        setTriggerResult({
          polled: false,
          error: res.data.error || "Sync execution failed."
        });
      }
    } catch (err: any) {
      setTriggerResult({
        polled: false,
        error: err.message || "Request timed out."
      });
    } finally {
      setTriggering(false);
      setTimeout(() => setTriggerResult(null), 5000);
    }
  };

  const unsyncedBlocks = status ? Math.max(0, status.latestBlock - status.lastProcessedBlock) : 0;
  const isFullySynced = unsyncedBlocks === 0;

  return (
    <DashboardShell>
      <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full px-4 py-2">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-5">
          <div>
            <div className="flex items-center gap-2 text-cyan-400">
              <Server size={22} className="animate-pulse" />
              <span className="font-orbitron text-xs font-bold uppercase tracking-widest">System Monitor</span>
            </div>
            <h1 className="font-orbitron font-extrabold text-2xl md:text-3xl text-white mt-1 bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              Blockchain Event Indexer
            </h1>
            <p className="text-slate-400 text-xs mt-1">
              Real-time monitoring of decentralized ledger transactions synced to local state.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleManualTrigger}
              disabled={triggering || loading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400 font-orbitron font-bold text-xs tracking-wider hover:bg-cyan-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={12} className={triggering ? "animate-spin" : ""} />
              {triggering ? "SWEEPING BLOCKS..." : "FORCE SYNC SWEEP"}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs p-4 rounded-xl flex items-start gap-3">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Connection Failure</div>
              <p className="mt-0.5 text-slate-400">{error} Ensure the backend Node server on port 3000 is active.</p>
            </div>
          </div>
        )}

        {/* Top metrics grids */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          
          {/* Card 1: Pipeline Status */}
          <div className="glass-panel p-5 rounded-2xl border border-white/5 bg-[#05060f]/60 relative overflow-hidden">
            <div className="absolute top-4 right-4 text-cyan-500/10">
              <Activity size={32} />
            </div>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold block">Indexer Pipeline</span>
            <div className="mt-3 flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${status?.status === "active" ? "bg-emerald-400 animate-ping" : "bg-rose-400 animate-pulse"}`} />
              <span className="font-orbitron text-xl font-bold text-white capitalize">
                {status?.status || "Offline"}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-2">
              Polling frequency: Every {status ? status.pollIntervalMs / 1000 : 30}s
            </span>
          </div>

          {/* Card 2: Chain Height */}
          <div className="glass-panel p-5 rounded-2xl border border-white/5 bg-[#05060f]/60 relative overflow-hidden">
            <div className="absolute top-4 right-4 text-cyan-500/10">
              <Cpu size={32} />
            </div>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold block">RPC Node Height</span>
            <div className="mt-3">
              <span className="font-orbitron text-2xl font-bold text-white font-mono">
                #{status?.latestBlock || 0}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-2">
              Hoodi Testnet (Chain 560048)
            </span>
          </div>

          {/* Card 3: Indexer Height */}
          <div className="glass-panel p-5 rounded-2xl border border-white/5 bg-[#05060f]/60 relative overflow-hidden">
            <div className="absolute top-4 right-4 text-cyan-500/10">
              <Database size={32} />
            </div>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold block">Synced Height</span>
            <div className="mt-3">
              <span className="font-orbitron text-2xl font-bold text-cyan-400 font-mono">
                #{status?.lastProcessedBlock || 0}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-2">
              Prisma SQLite database level
            </span>
          </div>

          {/* Card 4: Sync Status */}
          <div className="glass-panel p-5 rounded-2xl border border-white/5 bg-[#05060f]/60 relative overflow-hidden">
            <div className="absolute top-4 right-4 text-cyan-500/10">
              <Clock size={32} />
            </div>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold block">Sync Status</span>
            <div className="mt-3 flex items-center gap-1.5">
              {isFullySynced ? (
                <>
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  <span className="font-orbitron text-xl font-bold text-emerald-400">Fully Synced</span>
                </>
              ) : (
                <>
                  <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  <span className="font-orbitron text-xl font-bold text-amber-400">{unsyncedBlocks} Behind</span>
                </>
              )}
            </div>
            <span className="text-[10px] text-slate-400 block mt-2">
              Last check: {status ? new Date(status.lastPollTime).toLocaleTimeString() : "Never"}
            </span>
          </div>

        </div>

        {/* Trigger Results Toast Area */}
        {triggerResult && (
          <div className={`p-4 rounded-xl border transition-all animate-pulse text-xs ${
            triggerResult.error 
              ? "bg-rose-500/15 border-rose-500/25 text-rose-400" 
              : triggerResult.polled 
              ? "bg-emerald-500/15 border-emerald-500/25 text-emerald-400" 
              : "bg-cyan-500/15 border-cyan-500/25 text-cyan-400"
          }`}>
            <div className="font-bold uppercase tracking-wider font-orbitron">
              {triggerResult.error ? "Sync Warning" : "Sync Sweep Finished"}
            </div>
            <p className="mt-0.5">
              {triggerResult.error 
                ? triggerResult.error 
                : triggerResult.polled 
                ? `Successfully crawled and indexed ${triggerResult.count} block(s).` 
                : "Up to date. No new blocks available to sweep."}
            </p>
          </div>
        )}

        {/* Bottom Split Layout: Terminal Logs & Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left / Center: Monospace Console Logs */}
          <div className="lg:col-span-2 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-orbitron font-bold text-sm text-white flex items-center gap-2">
                <TerminalIcon size={16} className="text-cyan-400" />
                Live Indexer Daemon logs
              </h3>
              <span className="text-[9px] text-slate-500 font-mono uppercase bg-white/5 px-2 py-0.5 rounded">
                Logs updated: real-time
              </span>
            </div>

            <div className="h-[400px] w-full rounded-2xl bg-[#03040b] border border-white/5 p-4 font-mono text-xs overflow-y-auto flex flex-col gap-2 shadow-inner relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/2 to-purple-500/2 pointer-events-none" />
              
              {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-500">
                  <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  <span>Connecting to indexer shell...</span>
                </div>
              ) : !status?.logs || status.logs.length === 0 ? (
                <div className="text-slate-600 italic">No logs recorded yet. Waiting for block updates...</div>
              ) : (
                status.logs.map((log, idx) => {
                  const levelColor = 
                    log.type === "error" 
                      ? "text-rose-400" 
                      : log.type === "warn" 
                      ? "text-amber-400" 
                      : "text-cyan-400";
                  
                  return (
                    <div key={idx} className="hover:bg-white/2 p-1 rounded transition-colors flex items-start gap-2">
                      <span className="text-slate-600 select-none">
                        [{new Date(log.timestamp).toLocaleTimeString()}]
                      </span>
                      <span className={`font-bold ${levelColor} select-none`}>
                        {log.type.toUpperCase()}:
                      </span>
                      <span className="text-slate-300 leading-relaxed whitespace-pre-wrap break-all">
                        {log.message}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Database Stats & Quick Info */}
          <div className="flex flex-col gap-6">
            
            {/* Database Stats Panel */}
            <div className="glass-panel p-6 rounded-2xl border border-white/5 bg-[#05060f]/60 flex flex-col gap-4">
              <h3 className="font-orbitron font-bold text-sm text-white flex items-center gap-2">
                <Database size={16} className="text-purple-400" />
                Indexed Database Stats
              </h3>

              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center bg-white/2 p-3 rounded-xl border border-white/5">
                  <div className="text-xs text-slate-400">Synced Perp Positions</div>
                  <div className="text-sm font-orbitron font-bold text-cyan-400">{dbStats.perps}</div>
                </div>
                <div className="flex justify-between items-center bg-white/2 p-3 rounded-xl border border-white/5">
                  <div className="text-xs text-slate-400">Synced Lending Loans</div>
                  <div className="text-sm font-orbitron font-bold text-purple-400">{dbStats.loans}</div>
                </div>
                <div className="flex justify-between items-center bg-white/2 p-3 rounded-xl border border-white/5">
                  <div className="text-xs text-slate-400">Synced Leveraged Spots</div>
                  <div className="text-sm font-orbitron font-bold text-emerald-400">{dbStats.spots}</div>
                </div>
              </div>
              
              <p className="text-[10px] text-slate-500 leading-normal">
                These numbers reflect the active transaction parameters mapped on-chain and stored locally to power your Unified Dashboard.
              </p>
            </div>

            {/* Quick Indexer Info */}
            <div className="glass-panel p-6 rounded-2xl border border-white/5 bg-[#05060f]/60 flex flex-col gap-3">
              <h4 className="text-xs font-orbitron font-bold text-slate-200 flex items-center gap-2">
                <HelpCircle size={14} className="text-cyan-400" />
                How the indexer works
              </h4>
              <ul className="flex flex-col gap-2 text-[11px] text-slate-400 leading-relaxed list-disc list-inside">
                <li>Queries event logs emitted directly by trading smart contracts.</li>
                <li>Avoids stateful WebSocket filters to prevent connection drop-outs.</li>
                <li>Parses values to database entities, converting decimals appropriately.</li>
                <li>Triggers state recalculations (Unified Dashboard Risk Score/Exposure).</li>
              </ul>
            </div>

          </div>

        </div>

      </div>
    </DashboardShell>
  );
}
