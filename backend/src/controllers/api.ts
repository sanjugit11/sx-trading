import { Response } from "express";
import { AuthenticatedRequest, generateSessionToken } from "../middleware/auth";
import { blockchainService } from "../blockchain/service";
import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";
import { indexerStatus, triggerIndexPoll } from "../blockchain/indexer";

const prisma = new PrismaClient();

export class ApiController {
  // SIWE Verification
  public async login(req: AuthenticatedRequest, res: Response) {
    const { address, message, signature } = req.body;
    
    const isValid = blockchainService.verifyWalletSignature(message, signature, address);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid signature or message address mismatch" });
    }

    try {
      let user = await prisma.user.findUnique({
        where: { address: address.toLowerCase() }
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            address: address.toLowerCase(),
            kycStatus: "APPROVED"
          }
        });
        // Create wallet
        await prisma.wallet.create({
          data: {
            userId: user.id,
            address: address.toLowerCase(),
            balanceUSD: 10000.0
          }
        });
      }

      const token = generateSessionToken(address);
      return res.status(200).json({ accessToken: token });
    } catch (err) {
      logger.error("Database error during login:", err);
      return res.status(500).json({ error: "Internal database login error" });
    }
  }

  // Get Profile
  public async getProfile(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
          wallet: true,
          perps: true,
          loans: true,
          spots: true,
          hiddenOrders: true
        }
      });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Map relation fields to what the frontend expects
      const responseData = {
        ...user,
        perpetualPositions: user.perps,
        positions: user.perps,
        borrowLoans: user.loans,
        loans: user.loans,
        leveragedSpots: user.spots,
        spots: user.spots,
        hiddenOrders: user.hiddenOrders
      };

      return res.status(200).json(responseData);
    } catch (err) {
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  // Unified Dashboard Metrics
  public async getDashboard(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    // Fetch protocol metrics + on-chain USDT wallet balance in parallel.
    // Each call has its own fallback so a contract error never produces a 500.
    const [metrics, usdtRaw] = await Promise.all([
      blockchainService.getUserDashboardMetrics(req.user.address),
      blockchainService.usdt.balanceOf(req.user.address).catch(() => BigInt(0))
    ]);

    const walletBalanceUSD = parseFloat(
      (Number(usdtRaw) / 1e18).toFixed(4)
    );

    // Best-effort DB sync — never let a DB failure block the response
    try {
      await prisma.wallet.update({
        where: { userId: req.user.id },
        data: { balanceUSD: walletBalanceUSD }
      });
    } catch (dbErr) {
      logger.error("Wallet DB sync error (non-fatal):", dbErr);
    }

    return res.status(200).json({
      ...metrics,
      walletBalanceUSD    // on-chain USDT balance, updates on every mint
    });
  }

  // Market Data (Oracle price + Funding rate) for an asset
  public async getMarketData(req: any, res: Response) {
    const { asset } = req.params;
    try {
      const [price, fundingRateRaw] = await Promise.all([
        blockchainService.getOraclePrice(asset),
        blockchainService.sxpt.getFundingRate(asset).catch(() => BigInt(0))
      ]);
      const fundingRate = Number(fundingRateRaw) / 1e18; // scaled from 18-decimal int
      return res.status(200).json({ asset, price, fundingRate });
    } catch (err) {
      logger.error("Market data controller error:", err);
      return res.status(500).json({ error: "Failed to fetch market data" });
    }
  }

  // Open Perpetual Position
  public async openPerpetual(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { posId, asset, leverage, marginAmount, isLong, isCross } = req.body;

    try {
      // For local testing: mock Oracle entry price
      const price = await blockchainService.getOraclePrice(asset);
      const finalPosId = posId ? Number(posId) : Math.floor(Math.random() * 1000000);

      // Failsafe: Upsert to handle concurrent creation by the event indexer
      const pos = await prisma.perpetualPosition.upsert({
        where: { posId: finalPosId },
        update: {
          userId: req.user.id,
          asset: asset.toLowerCase(),
          leverage,
          marginAmount,
          size: marginAmount * leverage,
          isLong,
          isCross,
          isOpen: true,
          entryPrice: price
        },
        create: {
          userId: req.user.id,
          posId: finalPosId,
          asset: asset.toLowerCase(),
          leverage,
          marginAmount,
          size: marginAmount * leverage,
          isLong,
          isCross,
          isOpen: true,
          entryPrice: price
        }
      });

      return res.status(201).json({
        message: "Perpetual position registered on-chain",
        position: pos
      });
    } catch (err) {
      logger.error("Error opening perpetual:", err);
      return res.status(500).json({ error: "Failed to open perpetual position" });
    }
  }

  // Close Perpetual Position
  public async closePerpetual(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;

    try {
      let position;
      if (isNaN(Number(id))) {
        position = await prisma.perpetualPosition.findUnique({
          where: { id }
        });
      } else {
        position = await prisma.perpetualPosition.findUnique({
          where: { posId: Number(id) }
        });
      }

      if (!position || !position.isOpen) {
        return res.status(404).json({ error: "Position not found or already closed" });
      }

      const currentPrice = await blockchainService.getOraclePrice(position.asset);
      let pnl = 0;

      if (position.isLong) {
        pnl = (currentPrice - position.entryPrice) / position.entryPrice * position.size;
      } else {
        pnl = (position.entryPrice - currentPrice) / position.entryPrice * position.size;
      }

      // Update position status to closed
      const updated = await prisma.perpetualPosition.update({
        where: { id: position.id },
        data: {
          isOpen: false,
          pnl
        }
      });

      return res.status(200).json({
        message: "Perpetual position closed successfully",
        pnl,
        position: updated
      });
    } catch (err) {
      return res.status(500).json({ error: "Failed to close perpetual position" });
    }
  }

  // Asset Borrowing (Lending Contract)
  public async borrowLending(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { borrowAsset, borrowAmount, collateralAsset, collateralAmount, loanId } = req.body;

    try {
      const borrowPrice = await blockchainService.getOraclePrice(borrowAsset);
      const collateralPrice = await blockchainService.getOraclePrice(collateralAsset);

      const borrowValue = borrowAmount * borrowPrice;
      const collateralValue = collateralAmount * collateralPrice;

      // 250% LTV verification: Collateral value must be >= 2.5 * Borrow value
      if (collateralValue < borrowValue * 2.5) {
        return res.status(400).json({
          error: "LTV violation: Collateral value must be at least 250% of the borrow value."
        });
      }

      const resolvedLoanId = Number.isInteger(Number(loanId)) && Number(loanId) > 0
        ? Number(loanId)
        : Math.floor(Math.random() * 1000000);

      const loan = await prisma.lendingLoan.upsert({
        where: { loanId: resolvedLoanId },
        update: {
          userId: req.user.id,
          borrowAsset: borrowAsset.toLowerCase(),
          borrowAmount,
          collateralAsset: collateralAsset.toLowerCase(),
          collateralAmount,
          isOpen: true
        },
        create: {
          userId: req.user.id,
          loanId: resolvedLoanId,
          borrowAsset: borrowAsset.toLowerCase(),
          borrowAmount,
          collateralAsset: collateralAsset.toLowerCase(),
          collateralAmount,
          isOpen: true
        }
      });

      return res.status(201).json({
        message: "Loan borrowed successfully",
        loan
      });
    } catch (err) {
      return res.status(500).json({ error: "Borrow request failed" });
    }
  }

  // Repay Lending Loan
  public async repayLending(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;

    try {
      const loan = await prisma.lendingLoan.findUnique({
        where: { id }
      });

      if (!loan || !loan.isOpen) {
        return res.status(404).json({ error: "Loan not found or already repaid" });
      }

      const updated = await prisma.lendingLoan.update({
        where: { id },
        data: { isOpen: false }
      });

      return res.status(200).json({
        message: "Loan repaid successfully",
        loan: updated
      });
    } catch (err) {
      return res.status(500).json({ error: "Repayment failed" });
    }
  }

  // Open Spot Trade Position
  public async openSpot(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { posId, targetAsset, collateralAmount, leverage, isLimit, triggerPrice } = req.body;

    try {
      const entryPrice = await blockchainService.getOraclePrice(targetAsset);
      const finalPosId = posId ? Number(posId) : Math.floor(Math.random() * 1000000);

      const spot = await prisma.leveragedSpot.upsert({
        where: { posId: finalPosId },
        update: {
          userId: req.user.id,
          targetAsset: targetAsset.toLowerCase(),
          collateralAmount,
          leverage,
          size: collateralAmount * leverage,
          isLimit,
          triggerPrice: triggerPrice || null,
          isOpen: !isLimit,
          isPending: isLimit
        },
        create: {
          userId: req.user.id,
          posId: finalPosId,
          targetAsset: targetAsset.toLowerCase(),
          collateralAmount,
          leverage,
          size: collateralAmount * leverage,
          isLimit,
          triggerPrice: triggerPrice || null,
          isOpen: !isLimit,
          isPending: isLimit
        }
      });

      return res.status(201).json({
        message: isLimit ? "Limit order placed" : "Market spot position opened",
        spot
      });
    } catch (err) {
      logger.error("Error opening spot:", err);
      return res.status(500).json({ error: "Failed to open spot position" });
    }
  }

  // Close Spot Position
  public async closeSpot(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;

    try {
      let spot;
      if (isNaN(Number(id))) {
        spot = await prisma.leveragedSpot.findUnique({
          where: { id }
        });
      } else {
        spot = await prisma.leveragedSpot.findUnique({
          where: { posId: Number(id) }
        });
      }

      if (!spot || !spot.isOpen) {
        return res.status(404).json({ error: "Spot position not found or already closed" });
      }

      // Update spot status to closed
      const updated = await prisma.leveragedSpot.update({
        where: { id: spot.id },
        data: {
          isOpen: false
        }
      });

      return res.status(200).json({
        message: "Spot position closed successfully",
        spot: updated
      });
    } catch (err) {
      logger.error("Error closing spot position:", err);
      return res.status(500).json({ error: "Failed to close spot position" });
    }
  }

  // Update Spot Take-Profit / Stop-Loss (DB only — on-chain tx handled by frontend)
  public async updateSpotTakeProfit(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;
    const { takeProfit, stopLoss } = req.body;

    try {
      let spot;
      if (isNaN(Number(id))) {
        spot = await prisma.leveragedSpot.findUnique({ where: { id } });
      } else {
        spot = await prisma.leveragedSpot.findUnique({ where: { posId: Number(id) } });
      }

      if (!spot) {
        return res.status(404).json({ error: "Spot position not found" });
      }

      const updated = await prisma.leveragedSpot.update({
        where: { id: spot.id },
        data: {
          ...(takeProfit !== undefined && { takeProfit: Number(takeProfit) }),
          ...(stopLoss !== undefined && { stopLoss: Number(stopLoss) })
        }
      });

      return res.status(200).json({
        message: "Take-profit updated successfully",
        spot: updated
      });
    } catch (err) {
      logger.error("Error updating spot take-profit:", err);
      return res.status(500).json({ error: "Failed to update take-profit" });
    }
  }

  // Place Hidden Order
  public async placeHiddenOrder(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { commitment, orderId } = req.body;

    try {
      const resolvedOrderId = typeof orderId === 'number' ? orderId : Math.floor(Math.random() * 1000000);
      const hidden = await prisma.hiddenOrder.create({
        data: {
          userId: req.user.id,
          orderId: resolvedOrderId,
          commitment,
          status: "PENDING"
        }
      });

      return res.status(201).json({
        message: "Hidden order commitment stored",
        order: hidden
      });
    } catch (err) {
      logger.error("Error placing hidden order in DB:", err);
      return res.status(500).json({ error: "Failed to place hidden order" });
    }
  }

  // Execute/Reveal Hidden Order
  public async executeHiddenOrder(req: AuthenticatedRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { orderId, executionDetails, proof } = req.body;

    try {
      const txHash = await blockchainService.executeHiddenOrder(orderId, executionDetails, proof);
      if (!txHash) {
        return res.status(400).json({ error: "ZK-simulation validation proof failed on-chain" });
      }

      const updated = await prisma.hiddenOrder.updateMany({
        where: { orderId },
        data: { status: "EXECUTED" }
      });

      return res.status(200).json({
        message: "Hidden order parameters revealed and executed successfully",
        transactionHash: txHash
      });
    } catch (err) {
      return res.status(500).json({ error: "Failed to execute hidden order" });
    }
  }

  // Admin status — read kill switch state from on-chain
  public async getAdminStatus(req: any, res: Response) {
    try {
      const killSwitchActive = await blockchainService.getKillSwitchStatus();
      return res.status(200).json({ killSwitchActive });
    } catch (err) {
      logger.error("Error reading admin status:", err);
      // Fail open (don't halt UI if contract is unreachable)
      return res.status(200).json({ killSwitchActive: false, error: "Contract unreachable" });
    }
  }

  // Get Security Audit Logs
  public async getSecurityLogs(req: any, res: Response) {
    try {
      const logs = await prisma.auditLog.findMany({
        orderBy: { timestamp: "desc" },
        take: 30
      });
      return res.status(200).json(logs);
    } catch (err) {
      logger.error("Failed to fetch security logs:", err);
      return res.status(500).json({ error: "Failed to fetch security logs" });
    }
  }

  // Create Security Audit Log
  public async createSecurityLog(req: any, res: Response) {
    const { action, details, userId } = req.body;
    try {
      const log = await prisma.auditLog.create({
        data: {
          action,
          details,
          userId: userId || null,
          ipAddress: req.ip || "127.0.0.1"
        }
      });
      return res.status(201).json(log);
    } catch (err) {
      logger.error("Failed to create security log:", err);
      return res.status(500).json({ error: "Failed to create security log" });
    }
  }

  // Get Event Indexer Status
  public getIndexerStatus(req: any, res: Response) {
    return res.status(200).json(indexerStatus);
  }

  // Manually Trigger Event Indexer Poll
  public async triggerIndexerPoll(req: any, res: Response) {
    try {
      const result = await triggerIndexPoll();
      return res.status(200).json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || err });
    }
  }
}

export const apiController = new ApiController();
