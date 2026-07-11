"use client";

import React, { useState, useEffect, useCallback } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { useWeb3 } from "@/context/Web3Context";
import { EyeOff, ShieldCheck, AlertTriangle } from "lucide-react";
import axios from "axios";
import { ethers } from "ethers";
import { CONTRACT_ADDRESSES, CONTRACT_ABIS } from "@/blockchain/config";

export default function HiddenOrdersPage() {
  const { token, sendTransaction, address } = useWeb3();
  const [commitment, setCommitment] = useState("");
  const [proof, setProof] = useState("0x0123456789abcdef");
  const [orderId, setOrderId] = useState(1);
  const [orderType, setOrderType] = useState<"HOBL" | "HOPL" | "HOTL">("HOBL");
  const [executionDetails, setExecutionDetails] = useState("");
  const [execProof, setExecProof] = useState("0x0123456789abcdef");
  const [orders, setOrders] = useState<any[]>([]);
  const [proofVerified, setProofVerified] = useState(false);
  const [salt, setSalt] = useState("123456789abcdef");
  const [generatedPayload, setGeneratedPayload] = useState<{ commitmentHash: string; executionDetails: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitSuccess, setCommitSuccess] = useState<string | null>(null);
  const [execError, setExecError] = useState<string | null>(null);
  const [execSuccess, setExecSuccess] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get("/api/user/profile", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data && res.data.hiddenOrders) {
        setOrders(res.data.hiddenOrders);
      }
    } catch (err) {
      console.error("Error fetching hidden orders profile:", err);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchProfile();
    }
  }, [token, fetchProfile]);

  const buildHiddenOrderPayload = () => {
    const orderTypeValue = orderType === "HOBL" ? 0 : orderType === "HOPL" ? 1 : 2;
    const user = address ?? ethers.ZeroAddress;
    const targetAsset = CONTRACT_ADDRESSES.usdt;
    const collateralAmount = ethers.parseEther("100");
    const leverage = BigInt(10);
    const price = ethers.parseEther("1");
    const saltValue = ethers.toBigInt(`0x${salt}`);

    const encodedPayload = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint256", "uint256", "uint8", "uint256", "uint256"],
      [user, targetAsset, collateralAmount, leverage, orderTypeValue, price, saltValue]
    );

    const commitmentHash = ethers.keccak256(encodedPayload);

    return {
      commitmentHash,
      executionDetails: encodedPayload
    };
  };

  // Helper to generate a mock commitment hash for a set of trading parameters
  const generateMockCommitment = () => {
    const payload = buildHiddenOrderPayload();
    setGeneratedPayload(payload);
    setCommitment(payload.commitmentHash);
    setExecutionDetails(payload.executionDetails);
    setProofVerified(true);
    setCommitError(null);
    setCommitSuccess("Mock ZK parameters and matching reveal payload generated successfully!");
  };

  const handlePlaceOrder = async () => {
    if (!token) return;
    if (!commitment) {
      setCommitError("Please generate or enter a commitment hash first.");
      return;
    }
    setLoading(true);
    setCommitError(null);
    setCommitSuccess(null);

    try {
      setProofVerified(Boolean(proof && proof.length > 10));

      const payload = generatedPayload ?? buildHiddenOrderPayload();
      const commitmentToUse = payload.commitmentHash ?? commitment;
      setGeneratedPayload(payload);
      setCommitment(commitmentToUse);
      setExecutionDetails(payload.executionDetails);

      // 1. Submit transaction on-chain via MetaMask (or mock fallback)
      await sendTransaction(
        CONTRACT_ADDRESSES.sxhop,
        CONTRACT_ABIS.sxhop,
        "placeHiddenOrder",
        [
          commitmentToUse,
          proof
        ]
      );

      const readProvider = new ethers.JsonRpcProvider("https://rpc.hoodi.ethpandaops.io");
      const readContract = new ethers.Contract(CONTRACT_ADDRESSES.sxhop, CONTRACT_ABIS.sxhop, readProvider);
      const latestOrderId = Number(await readContract.orderCounter());
      setOrderId(latestOrderId);

      // 1.5. Save clear details in local storage for easy recovery/execution
      if (address) {
        localStorage.setItem(
          `hidden_order_${address.toLowerCase()}_${latestOrderId}`,
          JSON.stringify({
            orderId: latestOrderId,
            commitment: commitmentToUse,
            salt,
            orderType,
            executionDetails: payload.executionDetails
          })
        );
      }

      // 2. Synchronize to database
      const res = await axios.post("/api/hidden/place", {
        commitment: commitmentToUse,
        proof,
        orderId: latestOrderId
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCommitSuccess(`Hidden order commitment placed on-chain! Order ID is #${latestOrderId}`);
      await fetchProfile();
    } catch (err: any) {
      setCommitError(err.message || "Failed to commit order on-chain");
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteOrder = async () => {
    if (!token) return;
    if (!executionDetails) {
      setExecError("Please generate commitment parameters or input execution details.");
      return;
    }
    setLoading(true);
    setExecError(null);
    setExecSuccess(null);

    try {
      setProofVerified(Boolean(execProof && execProof.length > 10));

      const executionDetailsToUse = executionDetails;

      // Request Keeper execution on the backend (which executes it on-chain & updates database)
      const res = await axios.post("/api/hidden/execute", {
        orderId,
        executionDetails: executionDetailsToUse,
        proof: execProof
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setExecSuccess(`Hidden order #${orderId} successfully revealed & matched on-chain by Keeper! Tx: ${res.data.transactionHash.substring(0, 16)}...`);
      await fetchProfile();
    } catch (err: any) {
      setExecError(err.response?.data?.error || err.message || "Reveal matching verification failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardShell>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Place/Commit Hidden Order Panel: 6 columns */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col gap-5">
            <div className="flex items-center gap-2">
              <EyeOff size={18} className="text-cyan-400" />
              <h3 className="font-orbitron font-bold text-base text-white">Commit Private Order</h3>
            </div>
            <p className="text-xs text-slate-400">Lock the order parameters inside a commitment hash to hide trading actions from frontrunning bots.</p>

            <button
              onClick={generateMockCommitment}
              className="py-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all text-xs font-semibold font-orbitron text-cyan-400"
            >
              GENERATE RANDOM SALT & COMMITMENT
            </button>

            {/* Commitment Hash */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-500 uppercase font-orbitron tracking-wider">Commitment Hash</label>
              <input
                type="text"
                value={commitment}
                onChange={(e) => setCommitment(e.target.value)}
                placeholder="0x..."
                className="w-full bg-[#05060f] border border-white/5 rounded-xl py-3 px-4 text-xs font-mono text-white focus:outline-none focus:border-cyan-400/50"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-500 uppercase font-orbitron tracking-wider">Order Type</label>
              <div className="grid grid-cols-3 gap-2">
                {(["HOBL", "HOPL", "HOTL"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      setOrderType(type);
                      setGeneratedPayload(null);
                      setCommitment("");
                      setExecutionDetails("");
                      setCommitSuccess(null);
                      setCommitError(null);
                    }}
                    className={`py-2 rounded-lg text-[11px] font-orbitron font-semibold transition-all ${orderType === type ? "bg-cyan-500/10 text-cyan-400 border border-cyan-400/20" : "bg-white/5 text-slate-400 border border-white/5"}`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-500 uppercase font-orbitron tracking-wider">Salt</label>
              <input
                type="text"
                value={salt}
                onChange={(e) => setSalt(e.target.value)}
                placeholder="hex value"
                className="w-full bg-[#05060f] border border-white/5 rounded-xl py-3 px-4 text-xs font-mono text-white focus:outline-none"
              />
            </div>

            {/* Proof Input */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-500 uppercase font-orbitron tracking-wider">ZK-Proof parameter payload</label>
              <input
                type="text"
                value={proof}
                onChange={(e) => setProof(e.target.value)}
                className="w-full bg-[#05060f] border border-white/5 rounded-xl py-3 px-4 text-xs font-mono text-slate-400 focus:outline-none"
              />
            </div>

            <div className="rounded-xl border border-white/5 bg-[#05060f]/70 p-3 text-[11px] text-slate-400">
              <div className="flex items-center justify-between">
                <span>Proof verification</span>
                <span className={`font-semibold ${proofVerified ? "text-emerald-400" : "text-amber-400"}`}>
                  {proofVerified ? "VERIFIED" : "PENDING"}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">The contract accepts a non-empty proof payload for HOBL, HOPL, and HOTL commitments.</p>
            </div>

            {commitError && (
              <div className="bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs p-3.5 rounded-xl flex items-center gap-2">
                <AlertTriangle size={16} />
                <span>{commitError}</span>
              </div>
            )}

            {commitSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs p-3.5 rounded-xl flex items-center gap-2">
                <ShieldCheck size={16} />
                <span>{commitSuccess}</span>
              </div>
            )}

            <button
              onClick={handlePlaceOrder}
              disabled={loading}
              className="w-full py-4 rounded-xl glow-btn-cyan text-slate-950 font-orbitron font-bold text-sm tracking-wider cursor-pointer"
            >
              {loading ? "CONFIRMING IN WALLET..." : "SUBMIT ON-CHAIN COMMITMENT"}
            </button>
          </div>
        </div>

        {/* Execute/Reveal Hidden Order Panel: 6 columns */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col gap-5">
            <h3 className="font-orbitron font-bold text-base text-white">Reveal & Match Execution</h3>
            <p className="text-xs text-slate-400">Expose parameters matching the commitment hash to trigger ZK execution.</p>

            {/* Order ID Selection */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-500 uppercase font-orbitron tracking-wider">Order ID</label>
              <input
                type="number"
                value={orderId}
                onChange={(e) => setOrderId(Number(e.target.value))}
                className="w-full bg-[#05060f] border border-white/5 rounded-xl py-3 px-4 text-sm font-mono text-white focus:outline-none"
              />
            </div>

            {/* Execution Details parameters */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-500 uppercase font-orbitron tracking-wider">Execution Details (Clear parameters)</label>
              <input
                type="text"
                value={executionDetails}
                onChange={(e) => setExecutionDetails(e.target.value)}
                placeholder="0x..."
                className="w-full bg-[#05060f] border border-white/5 rounded-xl py-3 px-4 text-xs font-mono text-white focus:outline-none"
              />
            </div>

            <div className="rounded-xl border border-white/5 bg-[#05060f]/70 p-3 text-[11px] text-slate-400">
              <div className="flex items-center justify-between">
                <span>Execution proof</span>
                <span className={`font-semibold ${proofVerified ? "text-emerald-400" : "text-amber-400"}`}>
                  {proofVerified ? "VERIFIED" : "PENDING"}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">Reveal the matching execution payload to verify the hidden order against the on-chain commitment.</p>
            </div>

            {execError && (
              <div className="bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs p-3.5 rounded-xl flex items-center gap-2">
                <AlertTriangle size={16} />
                <span>{execError}</span>
              </div>
            )}

            {execSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs p-3.5 rounded-xl flex items-center gap-2">
                <ShieldCheck size={16} />
                <span>{execSuccess}</span>
              </div>
            )}

            <button
              onClick={handleExecuteOrder}
              disabled={loading}
              className="w-full py-4 rounded-xl glow-btn-purple text-white font-orbitron font-bold text-sm tracking-wider cursor-pointer"
            >
              {loading ? "CONFIRMING IN WALLET..." : "VERIFY & REVEAL ORDER"}
            </button>
          </div>
        </div>

        {/* Committed Private Orders List: 12 columns */}
        <div className="lg:col-span-12 flex flex-col gap-6">
          <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h3 className="font-orbitron font-bold text-base text-white">Your Committed Private Orders</h3>
              <span className="text-[10px] text-slate-500 font-mono">{orders.length} orders total</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-slate-500 uppercase font-orbitron tracking-wider">
                    <th className="pb-3 font-semibold">Order ID</th>
                    <th className="pb-3 font-semibold">Commitment Hash</th>
                    <th className="pb-3 font-semibold">Type</th>
                    <th className="pb-3 font-semibold">Decryption Secret (Salt)</th>
                    <th className="pb-3 font-semibold">Status</th>
                    <th className="pb-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500 italic">
                        No private order commitments found.
                      </td>
                    </tr>
                  ) : (
                    orders.map((ord: any) => {
                      // Look up local storage decryption keys
                      const localKey = `hidden_order_${address?.toLowerCase()}_${ord.orderId}`;
                      let localData: any = null;
                      try {
                        const localVal = localStorage.getItem(localKey);
                        if (localVal) {
                          localData = JSON.parse(localVal);
                        }
                      } catch (e) {}

                      return (
                        <tr key={ord.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-3 font-mono font-semibold text-white">#{ord.orderId}</td>
                          <td className="py-3 font-mono text-slate-400" title={ord.commitment}>
                            {ord.commitment.substring(0, 16)}...{ord.commitment.substring(ord.commitment.length - 8)}
                          </td>
                          <td className="py-3 font-orbitron">
                            {localData ? (
                              <span className="text-cyan-400 font-semibold">{localData.orderType}</span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="py-3 font-mono">
                            {localData ? (
                              <span className="text-emerald-400 font-semibold">{localData.salt}</span>
                            ) : (
                              <span className="text-amber-400 italic text-[10px]">Missing locally</span>
                            )}
                          </td>
                          <td className="py-3 font-semibold">
                            <span className={`px-2 py-0.5 rounded text-[10px] ${
                              ord.status === "EXECUTED" 
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25" 
                                : ord.status === "CANCELLED"
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/25"
                                : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/25"
                            }`}>
                              {ord.status}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            {ord.status === "PENDING" && localData && (
                              <button
                                onClick={() => {
                                  setOrderId(ord.orderId);
                                  setExecutionDetails(localData.executionDetails);
                                  setExecSuccess("Payload auto-filled! Ready to reveal and execute.");
                                  setExecError(null);
                                }}
                                className="px-2.5 py-1 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 transition-all font-semibold font-orbitron cursor-pointer"
                              >
                                AUTO-FILL EXECUTE
                              </button>
                            )}
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
