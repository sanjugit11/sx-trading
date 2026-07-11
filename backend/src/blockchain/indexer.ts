import { blockchainService } from "./service";
import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";
import { ethers } from "ethers";

const prisma = new PrismaClient();

// Poll interval in milliseconds (30 s — reduced from 12s to avoid RPC spam)
const POLL_INTERVAL_MS = 30_000;

export interface IndexerLog {
  timestamp: string;
  type: "info" | "error" | "warn";
  message: string;
}

export const indexerStatus = {
  status: "active",
  lastProcessedBlock: 0,
  latestBlock: 0,
  pollIntervalMs: POLL_INTERVAL_MS,
  lastPollTime: new Date().toISOString(),
  logs: [] as IndexerLog[]
};

function addLog(type: "info" | "error" | "warn", message: string) {
  const timestamp = new Date().toISOString();
  indexerStatus.logs.unshift({ timestamp, type, message });
  if (indexerStatus.logs.length > 50) {
    indexerStatus.logs.pop();
  }
}

/**
 * Poll for events by querying logs over the most recent block range.
 * This avoids eth_newFilter (stateful) which is unsupported on load-balanced RPC endpoints.
 */
async function pollEvents(fromBlock: number, toBlock: number) {
  // ── 1. PerpetualPositionOpened ──────────────────────────────────────────────
  try {
    const events = await blockchainService.sxpt.queryFilter(
      blockchainService.sxpt.filters.PerpetualPositionOpened(),
      fromBlock,
      toBlock
    );
    for (const raw of events) {
      const e = raw as ethers.EventLog;
      const [positionId, userAddress, assetAddress, leverage, marginAmount, isLong, isCross, entryPrice] = e.args;
      const msg = `Event: [PerpetualPositionOpened] | Method: [openPerpetualPosition] | Position ID: #${positionId} | Tx: ${e.transactionHash.slice(0, 18)}... | User: ${userAddress.slice(0, 8)}... | Margin: ${Number(marginAmount) / 1e18} USDT | Leverage: ${leverage}x`;
      logger.info(msg);
      addLog("info", msg);
      try {
        const dbUser = await prisma.user.findUnique({ where: { address: userAddress.toLowerCase() } });
        if (dbUser) {
          const pos = await blockchainService.sxpt.positions(positionId);
          await prisma.perpetualPosition.upsert({
            where: { posId: Number(positionId) },
            create: {
              posId: Number(positionId),
              userId: dbUser.id,
              asset: pos.asset.toLowerCase(),
              leverage: Number(leverage),
              marginAmount: Number(marginAmount) / 1e18,
              size: (Number(marginAmount) / 1e18) * Number(leverage),
              isLong,
              isCross,
              entryPrice: 1.0,
              isOpen: true
            },
            update: { isOpen: true }
          });
        }
      } catch (err: any) {
        logger.error("Error processing PerpetualPositionOpened event:", err);
        addLog("error", `Error processing PerpetualPositionOpened: ${err.message || err}`);
      }
    }
  } catch (err: any) {
    logger.error("Error querying PerpetualPositionOpened events:", err);
    addLog("error", `Error querying PerpetualPositionOpened: ${err.message || err}`);
  }

  // ── 2. PerpetualPositionClosed ──────────────────────────────────────────────
  try {
    const events = await blockchainService.sxpt.queryFilter(
      blockchainService.sxpt.filters.PerpetualPositionClosed(),
      fromBlock,
      toBlock
    );
    for (const raw of events) {
      const e = raw as ethers.EventLog;
      const [positionId, , finalPnL] = e.args;
      const msg = `Event: [PerpetualPositionClosed] | Method: [closePerpetualPosition] | Position ID: #${positionId} | Tx: ${e.transactionHash.slice(0, 18)}... | PnL: ${Number(finalPnL) / 1e18} USDT`;
      logger.info(msg);
      addLog("info", msg);
      try {
        await prisma.perpetualPosition.updateMany({
          where: { posId: Number(positionId) },
          data: { isOpen: false, pnl: Number(finalPnL) / 1e18 }
        });
      } catch (err: any) {
        logger.error("Error processing PerpetualPositionClosed event:", err);
        addLog("error", `Error processing PerpetualPositionClosed: ${err.message || err}`);
      }
    }
  } catch (err: any) {
    logger.error("Error querying PerpetualPositionClosed events:", err);
    addLog("error", `Error querying PerpetualPositionClosed: ${err.message || err}`);
  }

  // ── 3. LoanCreated ─────────────────────────────────────────────────────────
  try {
    const events = await blockchainService.sxlt.queryFilter(
      blockchainService.sxlt.filters.LoanCreated(),
      fromBlock,
      toBlock
    );
    for (const raw of events) {
      const e = raw as ethers.EventLog;
      const [loanId, userAddress, borrowAsset, borrowAmount, collateralAsset, collateralAmount] = e.args;
      const msg = `Event: [LoanCreated] | Method: [borrowAssets] | Loan ID: #${loanId} | Tx: ${e.transactionHash.slice(0, 18)}... | Borrower: ${userAddress.slice(0, 8)}... | Borrow: ${Number(borrowAmount) / 1e18} ${borrowAsset.slice(0, 8)}... | Collateral: ${Number(collateralAmount) / 1e18} ${collateralAsset.slice(0, 8)}...`;
      logger.info(msg);
      addLog("info", msg);
      try {
        const dbUser = await prisma.user.findUnique({ where: { address: userAddress.toLowerCase() } });
        if (dbUser) {
          await prisma.lendingLoan.upsert({
            where: { loanId: Number(loanId) },
            create: {
              loanId: Number(loanId),
              userId: dbUser.id,
              borrowAsset: borrowAsset.toLowerCase(),
              borrowAmount: Number(borrowAmount) / 1e18,
              collateralAsset: collateralAsset.toLowerCase(),
              collateralAmount: Number(collateralAmount) / 1e18,
              isOpen: true
            },
            update: { isOpen: true }
          });
        }
      } catch (err: any) {
        logger.error("Error processing LoanCreated event:", err);
        addLog("error", `Error processing LoanCreated: ${err.message || err}`);
      }
    }
  } catch (err: any) {
    logger.error("Error querying LoanCreated events:", err);
    addLog("error", `Error querying LoanCreated: ${err.message || err}`);
  }

  // ── 4. LoanRepaid ──────────────────────────────────────────────────────────
  try {
    const events = await blockchainService.sxlt.queryFilter(
      blockchainService.sxlt.filters.LoanRepaid(),
      fromBlock,
      toBlock
    );
    for (const raw of events) {
      const e = raw as ethers.EventLog;
      const [loanId] = e.args;
      const msg = `Event: [LoanRepaid] | Method: [repayLoan] | Loan ID: #${loanId} | Tx: ${e.transactionHash.slice(0, 18)}...`;
      logger.info(msg);
      addLog("info", msg);
      try {
        await prisma.lendingLoan.updateMany({
          where: { loanId: Number(loanId) },
          data: { isOpen: false }
        });
      } catch (err: any) {
        logger.error("Error processing LoanRepaid event:", err);
        addLog("error", `Error processing LoanRepaid: ${err.message || err}`);
      }
    }
  } catch (err: any) {
    logger.error("Error querying LoanRepaid events:", err);
    addLog("error", `Error querying LoanRepaid: ${err.message || err}`);
  }

  // ── 5. LeveragedSpotOpened ─────────────────────────────────────────────────
  try {
    const events = await blockchainService.sxls.queryFilter(
      blockchainService.sxls.filters.LeveragedSpotOpened(),
      fromBlock,
      toBlock
    );
    for (const raw of events) {
      const e = raw as ethers.EventLog;
      const [positionId, userAddress, targetAsset, leverage] = e.args;
      const msg = `Event: [LeveragedSpotOpened] | Method: [openLeveragedSpot] | Position ID: #${positionId} | Tx: ${e.transactionHash.slice(0, 18)}... | User: ${userAddress.slice(0, 8)}... | Asset: ${targetAsset.slice(0, 8)}... | Leverage: ${leverage}x`;
      logger.info(msg);
      addLog("info", msg);
      try {
        const dbUser = await prisma.user.findUnique({ where: { address: userAddress.toLowerCase() } });
        if (dbUser) {
          await prisma.leveragedSpot.upsert({
            where: { posId: Number(positionId) },
            create: {
              posId: Number(positionId),
              userId: dbUser.id,
              targetAsset: targetAsset.toLowerCase(),
              collateralAmount: 0,
              leverage: Number(leverage),
              size: 0,
              isLimit: false,
              isOpen: true
            },
            update: { isOpen: true }
          });
        }
      } catch (err: any) {
        logger.error("Error processing LeveragedSpotOpened event:", err);
        addLog("error", `Error processing LeveragedSpotOpened: ${err.message || err}`);
      }
    }
  } catch (err: any) {
    logger.error("Error querying LeveragedSpotOpened events:", err);
    addLog("error", `Error querying LeveragedSpotOpened: ${err.message || err}`);
  }
}

export async function startEventIndexer() {
  logger.info("Initializing blockchain event listener indexing pipelines...");
  addLog("info", "Initializing blockchain event listener indexing pipelines...");

  // Fetch the latest block to start polling from
  let lastProcessedBlock: number;
  try {
    lastProcessedBlock = await blockchainService.provider.getBlockNumber();
    logger.info(`Event indexer starting from block #${lastProcessedBlock}`);
    addLog("info", `Event indexer starting from block #${lastProcessedBlock}`);
    indexerStatus.lastProcessedBlock = lastProcessedBlock;
    indexerStatus.latestBlock = lastProcessedBlock;
  } catch (err: any) {
    logger.error("Could not fetch current block number; event indexer will retry:", err);
    addLog("warn", `Could not fetch current block number; event indexer will retry: ${err.message || err}`);
    lastProcessedBlock = 0;
  }

  // Kick off the polling loop
  setInterval(async () => {
    try {
      const latestBlock = await blockchainService.provider.getBlockNumber();
      indexerStatus.latestBlock = latestBlock;
      indexerStatus.lastPollTime = new Date().toISOString();

      if (latestBlock <= lastProcessedBlock) return; // no new blocks

      addLog("info", `Polling block range: #${lastProcessedBlock + 1} to #${latestBlock}`);
      await pollEvents(lastProcessedBlock + 1, latestBlock);
      lastProcessedBlock = latestBlock;
      indexerStatus.lastProcessedBlock = lastProcessedBlock;
    } catch (err: any) {
      logger.error("Event indexer poll error:", err);
      addLog("error", `Event indexer poll error: ${err.message || err}`);
    }
  }, POLL_INTERVAL_MS);
}

export async function triggerIndexPoll() {
  indexerStatus.lastPollTime = new Date().toISOString();
  try {
    const latestBlock = await blockchainService.provider.getBlockNumber();
    indexerStatus.latestBlock = latestBlock;
    
    if (latestBlock > indexerStatus.lastProcessedBlock) {
      const from = indexerStatus.lastProcessedBlock + 1;
      addLog("info", `Manual trigger: Polling blocks #${from} to #${latestBlock}`);
      await pollEvents(from, latestBlock);
      indexerStatus.lastProcessedBlock = latestBlock;
      return { success: true, polled: true, count: latestBlock - from + 1 };
    } else {
      addLog("info", `Manual trigger: No new blocks found (current block: #${latestBlock})`);
      return { success: true, polled: false };
    }
  } catch (err: any) {
    addLog("error", `Manual trigger failed: ${err.message || err}`);
    logger.error("Manual trigger failed:", err);
    return { success: false, error: err.message || err };
  }
}
