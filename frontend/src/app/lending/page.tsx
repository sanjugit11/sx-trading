"use client";

import React, { useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { useWeb3 } from "@/context/Web3Context";
import { Coins, AlertTriangle, ShieldCheck, HelpCircle } from "lucide-react";
import axios from "axios";
import { ethers } from "ethers";
import { CONTRACT_ADDRESSES, CONTRACT_ABIS } from "@/blockchain/config";

interface LoanRecord {
  id: string;
  loanId: number;
  borrowAmount: number;
  collateralAmount: number;
  createdAt: string;
  isOpen: boolean;
  borrowAsset: string;
  collateralAsset: string;
}

interface LentPosition {
  asset: string;
  amount: number;
}

export default function LendingPage() {
  const { token, sendTransaction, address } = useWeb3();
  const [borrowAsset, setBorrowAsset] = useState(CONTRACT_ADDRESSES.usdt);
  const [borrowAmount, setBorrowAmount] = useState(100);
  const [collateralAsset, setCollateralAsset] = useState(CONTRACT_ADDRESSES.usdt);
  const [collateralAmount, setCollateralAmount] = useState(300);
  const [lendAsset, setLendAsset] = useState(CONTRACT_ADDRESSES.usdt);
  const [lendAmount, setLendAmount] = useState(500);
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [lentPositions, setLentPositions] = useState<LentPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const collateralValue = collateralAmount * 1.0;
  const borrowValue = borrowAmount * 1.0;
  const satisfiesLTV = collateralValue >= borrowValue * 2.5;
  const totalLentValue = lentPositions.reduce((sum, position) => sum + position.amount, 0);

  const estimateInterest = (loan: LoanRecord) => {
    const createdAt = new Date(loan.createdAt).getTime();
    const elapsedSeconds = Math.max(0, (Date.now() - createdAt) / 1000);
    const annualRate = 0.072;
    return loan.borrowAmount * annualRate * (elapsedSeconds / (365 * 24 * 60 * 60));
  };

  const findMatchingOpenLoanId = async (expectedLoan: Partial<LoanRecord>) => {
    if (!address) return null;

    const readProvider = new ethers.JsonRpcProvider("https://rpc.hoodi.ethpandaops.io");
    const readContract = new ethers.Contract(CONTRACT_ADDRESSES.sxlt, CONTRACT_ABIS.sxlt, readProvider);
    const loanIds = await readContract.getUserLoans(address);

    for (const rawLoanId of loanIds) {
      const loanState = await readContract.loans(rawLoanId);
      const onChainBorrowAmount = Number(ethers.formatEther(loanState.borrowAmount));
      const onChainCollateralAmount = Number(ethers.formatEther(loanState.collateralAmount));

      const matches =
        loanState.isOpen &&
        loanState.borrowAsset.toLowerCase() === expectedLoan.borrowAsset?.toLowerCase() &&
        loanState.collateralAsset.toLowerCase() === expectedLoan.collateralAsset?.toLowerCase() &&
        Math.abs(onChainBorrowAmount - (expectedLoan.borrowAmount ?? 0)) < 0.01 &&
        Math.abs(onChainCollateralAmount - (expectedLoan.collateralAmount ?? 0)) < 0.01;

      if (matches) {
        return Number(rawLoanId);
      }
    }

    return null;
  };

  const handleLend = async () => {
    if (!token) {
      setError("Connect your wallet first to fund the lending pool.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await sendTransaction(
        CONTRACT_ADDRESSES.sxlt,
        CONTRACT_ABIS.sxlt,
        "lendAssets",
        [lendAsset, ethers.parseEther(lendAmount.toString())]
      );

      setLentPositions((prev) => {
        const existing = prev.find((position) => position.asset.toLowerCase() === lendAsset.toLowerCase());
        if (existing) {
          return prev.map((position) =>
            position.asset.toLowerCase() === lendAsset.toLowerCase()
              ? { ...position, amount: position.amount + lendAmount }
              : position
          );
        }
        return [...prev, { asset: lendAsset, amount: lendAmount }];
      });

      setSuccess(`Supplied ${lendAmount} USD of assets to the lending pool.`);
    } catch (err: any) {
      setError(err.message || "Failed to lend assets on-chain");
    } finally {
      setLoading(false);
    }
  };

  const handleBorrow = async () => {
    if (!token) {
      setError("Connect your wallet first to create a loan.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    if (!satisfiesLTV) {
      setError("LTV Violation: Collateral value must be at least 250% of the borrow amount.");
      setLoading(false);
      return;
    }

    try {
      const receipt = await sendTransaction(
        CONTRACT_ADDRESSES.sxlt,
        CONTRACT_ABIS.sxlt,
        "borrowAssets",
        [
          borrowAsset,
          ethers.parseEther(borrowAmount.toString()),
          collateralAsset,
          ethers.parseEther(collateralAmount.toString())
        ]
      );

      let onChainLoanId: number | null = null;
      if (address) {
        const readProvider = new ethers.JsonRpcProvider("https://rpc.hoodi.ethpandaops.io");
        const readContract = new ethers.Contract(CONTRACT_ADDRESSES.sxlt, CONTRACT_ABIS.sxlt, readProvider);
        const loanIds = await readContract.getUserLoans(address);
        if (loanIds?.length) {
          onChainLoanId = Number(loanIds[loanIds.length - 1]);
        }
      }

      if (!onChainLoanId) {
        setError("The loan was created on-chain, but its ID could not be read back. Please refresh and try again.");
        return;
      }

      const res = await axios.post(
        "http://localhost:3000/api/lending/borrow",
        {
          borrowAsset,
          borrowAmount,
          collateralAsset,
          collateralAmount,
          loanId: onChainLoanId
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const createdLoan = res.data.loan as LoanRecord;
      setLoans((prev) => [
        {
          id: createdLoan.id,
          loanId: createdLoan.loanId,
          borrowAmount: createdLoan.borrowAmount,
          collateralAmount: createdLoan.collateralAmount,
          createdAt: createdLoan.createdAt,
          isOpen: createdLoan.isOpen,
          borrowAsset: createdLoan.borrowAsset,
          collateralAsset: createdLoan.collateralAsset
        },
        ...prev
      ]);
      setSuccess(`Loan created at 250% LTV and funded for ${borrowAmount} USD.`);
    } catch (err: any) {
      setError(err.message || "Failed to borrow loan on-chain");
    } finally {
      setLoading(false);
    }
  };

  const handleRepay = async (loan: LoanRecord) => {
    if (!token) {
      setError("Connect your wallet first to repay the loan.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    if (!loan.isOpen) {
      setSuccess("This loan is already repaid.");
      setLoading(false);
      return;
    }

    try {
      const resolvedLoanId = await findMatchingOpenLoanId(loan);
      if (!resolvedLoanId) {
        setError("No open loan matching this record was found on-chain. It may already be closed.");
        setLoading(false);
        return;
      }

      const totalDebt = loan.borrowAmount + estimateInterest(loan);
      await sendTransaction(
        CONTRACT_ADDRESSES.sxlt,
        CONTRACT_ABIS.sxlt,
        "repayLoan",
        [BigInt(resolvedLoanId), ethers.parseEther(totalDebt.toFixed(6))]
      );

      await axios.post(
        `http://localhost:3000/api/lending/repay/${loan.id}`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setLoans((prev) => prev.map((entry) => (entry.id === loan.id ? { ...entry, isOpen: false } : entry)));
      setSuccess("Loan repaid successfully and collateral returned.");
    } catch (err: any) {
      setError(err.message || "Failed to repay the loan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardShell>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-6 flex flex-col gap-6">
          <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col gap-6">
            <div className="flex items-center gap-2">
              <Coins size={18} className="text-cyan-400" />
              <h3 className="font-orbitron font-bold text-base text-white">Supply Assets</h3>
            </div>
            <p className="text-xs text-slate-400">Lend assets into the pool to earn yield and support borrowing activity.</p>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-500 uppercase font-orbitron tracking-wider">Asset Address</label>
              <input
                value={lendAsset}
                onChange={(e) => setLendAsset(e.target.value)}
                className="w-full bg-[#05060f] border border-white/5 rounded-xl py-3 px-4 text-sm font-mono text-white focus:outline-none focus:border-cyan-400/50"
                placeholder="0x..."
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-500 uppercase font-orbitron tracking-wider">Lend Amount</label>
              <div className="relative">
                <input
                  type="number"
                  value={lendAmount}
                  onChange={(e) => setLendAmount(Number(e.target.value))}
                  className="w-full bg-[#05060f] border border-white/5 rounded-xl py-3 px-4 text-sm font-mono text-white focus:outline-none focus:border-cyan-400/50"
                  placeholder="0.00"
                />
                <span className="absolute right-4 top-3.5 text-xs text-slate-500 font-orbitron">USD</span>
              </div>
            </div>

            <button
              onClick={handleLend}
              disabled={loading || lendAmount <= 0}
              className="w-full py-4 rounded-xl glow-btn-cyan text-slate-950 font-orbitron font-bold text-sm tracking-wider cursor-pointer disabled:opacity-50"
            >
              {loading ? "CONFIRMING IN WALLET..." : "LEND ASSETS"}
            </button>
          </div>

          <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col gap-6">
            <h3 className="font-orbitron font-bold text-base text-white">Create Asset Loan</h3>
            <p className="text-xs text-slate-400">Lock collateral to borrow from the pool at a minimum 250% LTV ratio.</p>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-500 uppercase font-orbitron tracking-wider">Collateral Asset</label>
              <input
                value={collateralAsset}
                onChange={(e) => setCollateralAsset(e.target.value)}
                className="w-full bg-[#05060f] border border-white/5 rounded-xl py-3 px-4 text-sm font-mono text-white focus:outline-none focus:border-cyan-400/50"
                placeholder="0x..."
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-500 uppercase font-orbitron tracking-wider">Collateral Amount (To Lock)</label>
              <div className="relative">
                <input
                  type="number"
                  value={collateralAmount}
                  onChange={(e) => setCollateralAmount(Number(e.target.value))}
                  className="w-full bg-[#05060f] border border-white/5 rounded-xl py-3 px-4 text-sm font-mono text-white focus:outline-none focus:border-cyan-400/50"
                  placeholder="0.00"
                />
                <span className="absolute right-4 top-3.5 text-xs text-slate-500 font-orbitron">USD Collateral</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-500 uppercase font-orbitron tracking-wider">Borrow Asset</label>
              <input
                value={borrowAsset}
                onChange={(e) => setBorrowAsset(e.target.value)}
                className="w-full bg-[#05060f] border border-white/5 rounded-xl py-3 px-4 text-sm font-mono text-white focus:outline-none focus:border-cyan-400/50"
                placeholder="0x..."
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-slate-500 uppercase font-orbitron tracking-wider">Borrow Amount (To Receive)</label>
              <div className="relative">
                <input
                  type="number"
                  value={borrowAmount}
                  onChange={(e) => setBorrowAmount(Number(e.target.value))}
                  className="w-full bg-[#05060f] border border-white/5 rounded-xl py-3 px-4 text-sm font-mono text-white focus:outline-none focus:border-cyan-400/50"
                  placeholder="0.00"
                />
                <span className="absolute right-4 top-3.5 text-xs text-slate-500 font-orbitron">USD Debt</span>
              </div>
            </div>

            <div className="bg-[#05060f]/60 rounded-xl p-4 border border-white/5 flex flex-col gap-2.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Current Collateral Ratio:</span>
                <span className={`font-orbitron font-bold ${satisfiesLTV ? "text-emerald-400" : "text-rose-400"}`}>
                  {collateralValue > 0 ? ((collateralValue / borrowValue) * 100).toFixed(0) : "0"}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Required Minimum Collateralisation:</span>
                <span className="font-mono text-white font-semibold">250% LTV</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
                <div
                  className={`h-full transition-all duration-300 ${satisfiesLTV ? "bg-emerald-400" : "bg-rose-400"}`}
                  style={{ width: `${Math.min(((collateralValue / borrowValue) * 100) / 3, 100)}%` }}
                ></div>
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
              onClick={handleBorrow}
              disabled={loading}
              className="w-full py-4 rounded-xl glow-btn-cyan text-slate-950 font-orbitron font-bold text-sm tracking-wider cursor-pointer disabled:opacity-50"
            >
              {loading ? "CONFIRMING IN WALLET..." : "INITIATE LOAN"}
            </button>
          </div>
        </div>

        <div className="lg:col-span-6 flex flex-col gap-6">
          <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
            <h3 className="font-orbitron font-bold text-base text-white">Supply APY Yield Calculator</h3>
            <p className="text-xs text-slate-400">Dynamic interest yields vary based on total pool utilization parameters.</p>

            <div className="grid grid-cols-2 gap-4 mt-2">
              <div className="bg-[#05060f]/60 p-4 rounded-xl border border-white/5 flex flex-col gap-0.5">
                <span className="text-slate-500 text-[10px] uppercase font-orbitron">Supply APY</span>
                <span className="text-emerald-400 font-orbitron font-black text-xl">4.85%</span>
              </div>
              <div className="bg-[#05060f]/60 p-4 rounded-xl border border-white/5 flex flex-col gap-0.5">
                <span className="text-slate-500 text-[10px] uppercase font-orbitron">Borrow APY</span>
                <span className="text-rose-400 font-orbitron font-black text-xl">7.20%</span>
              </div>
            </div>

            <div className="bg-[#05060f]/60 rounded-xl p-4 border border-white/5">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Assets lent</span>
                <span className="font-mono text-white">${totalLentValue.toFixed(2)}</span>
              </div>
              {lentPositions.length === 0 ? (
                <p className="text-[11px] text-slate-500 mt-2">No assets supplied yet.</p>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  {lentPositions.map((position, index) => (
                    <div key={`${position.asset}-${index}`} className="flex justify-between rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-300">
                      <span className="font-mono">{position.asset.slice(0, 8)}…</span>
                      <span>${position.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-white/5 pt-4 mt-2">
              <div className="flex items-center justify-between">
                <span className="font-orbitron font-bold text-xs text-slate-300">Active Loans</span>
                <span className="text-[10px] text-slate-500">Interest accrues over time</span>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {loans.length === 0 ? (
                  <span className="text-xs text-slate-500 italic">No loans registered in this session.</span>
                ) : (
                  loans.map((loan) => {
                    const accrued = estimateInterest(loan);
                    return (
                      <div key={loan.id} className="bg-white/5 p-3 rounded-lg flex flex-col gap-2 text-xs">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="font-semibold block text-slate-200">Loan #{loan.loanId}</span>
                            <span className="text-[10px] text-slate-500">Borrow: ${loan.borrowAmount} | Locked: ${loan.collateralAmount}</span>
                          </div>
                          <span className={`font-orbitron font-bold ${loan.isOpen ? "text-emerald-400" : "text-slate-500"}`}>
                            {loan.isOpen ? "OPEN" : "REPAID"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>Estimated interest: ${accrued.toFixed(2)}</span>
                          {loan.isOpen ? (
                            <button
                              onClick={() => handleRepay(loan)}
                              disabled={loading}
                              className="px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-all font-semibold font-orbitron disabled:opacity-50"
                            >
                              REPAY
                            </button>
                          ) : (
                            <span className="text-slate-500">Settled</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
