import { blockchainService } from "./service";
import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";
import { ethers } from "ethers";

const prisma = new PrismaClient();

// Poll interval in milliseconds (30 s — reduced from 12s to avoid RPC spam)
const POLL_INTERVAL_MS = 30_000;

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
      const [positionId, userAddress, leverage, marginAmount, isLong, isCross] = e.args;
      logger.info(`Event: PerpetualPositionOpened detected for position #${positionId}`);
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
      } catch (err) {
        logger.error("Error processing PerpetualPositionOpened event:", err);
      }
    }
  } catch (err) {
    logger.error("Error querying PerpetualPositionOpened events:", err);
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
      logger.info(`Event: PerpetualPositionClosed detected for position #${positionId}`);
      try {
        await prisma.perpetualPosition.updateMany({
          where: { posId: Number(positionId) },
          data: { isOpen: false, pnl: Number(finalPnL) / 1e18 }
        });
      } catch (err) {
        logger.error("Error processing PerpetualPositionClosed event:", err);
      }
    }
  } catch (err) {
    logger.error("Error querying PerpetualPositionClosed events:", err);
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
      logger.info(`Event: LoanCreated detected for loan #${loanId}`);
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
      } catch (err) {
        logger.error("Error processing LoanCreated event:", err);
      }
    }
  } catch (err) {
    logger.error("Error querying LoanCreated events:", err);
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
      logger.info(`Event: LoanRepaid detected for loan #${loanId}`);
      try {
        await prisma.lendingLoan.updateMany({
          where: { loanId: Number(loanId) },
          data: { isOpen: false }
        });
      } catch (err) {
        logger.error("Error processing LoanRepaid event:", err);
      }
    }
  } catch (err) {
    logger.error("Error querying LoanRepaid events:", err);
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
      logger.info(`Event: LeveragedSpotOpened detected for position #${positionId}`);
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
      } catch (err) {
        logger.error("Error processing LeveragedSpotOpened event:", err);
      }
    }
  } catch (err) {
    logger.error("Error querying LeveragedSpotOpened events:", err);
  }
}

export async function startEventIndexer() {
  logger.info("Initializing blockchain event listener indexing pipelines...");

  // Fetch the latest block to start polling from
  let lastProcessedBlock: number;
  try {
    lastProcessedBlock = await blockchainService.provider.getBlockNumber();
    logger.info(`Event indexer starting from block #${lastProcessedBlock}`);
  } catch (err) {
    logger.error("Could not fetch current block number; event indexer will retry:", err);
    lastProcessedBlock = 0;
  }

  // Kick off the polling loop
  setInterval(async () => {
    try {
      const latestBlock = await blockchainService.provider.getBlockNumber();
      if (latestBlock <= lastProcessedBlock) return; // no new blocks

      await pollEvents(lastProcessedBlock + 1, latestBlock);
      lastProcessedBlock = latestBlock;
    } catch (err) {
      logger.error("Event indexer poll error:", err);
    }
  }, POLL_INTERVAL_MS);
}
