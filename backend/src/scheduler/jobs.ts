import cron from "node-cron";
import { blockchainService } from "../blockchain/service";
import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";
import { emitToUser } from "../websocket/server";

const prisma = new PrismaClient();

export function startBackgroundJobs() {
  logger.info("Initializing background cron schedulers...");

  // 1. Limit Order matching engine: every 60 seconds (was 10s — too aggressive)
  cron.schedule("*/60 * * * * *", async () => {
    logger.info("Cron matching engine: scanning database for pending limit spot orders...");
    try {
      const pendingSpots = await prisma.leveragedSpot.findMany({
        where: { isPending: true }
      });

      for (const spot of pendingSpots) {
        if (!spot.triggerPrice) continue;
        
        const currentPrice = await blockchainService.getOraclePrice(spot.targetAsset);
        // Execute if market price falls below limit trigger price
        if (currentPrice <= spot.triggerPrice) {
          logger.info(`Limit hit! Current price (${currentPrice}) <= Trigger (${spot.triggerPrice}). Executing spot order #${spot.posId}...`);
          
          const success = await blockchainService.checkAndExecuteLimit(spot.posId);
          if (success) {
            const user = await prisma.user.findUnique({ where: { id: spot.userId } });
            
            await prisma.leveragedSpot.update({
              where: { id: spot.id },
              data: { isPending: false, isOpen: true }
            });

            if (user) {
              emitToUser(user.address, "position_update", {
                type: "SPOT_LIMIT_EXECUTION",
                posId: spot.posId,
                status: "Executed"
              });
            }
          }
        }
      }
    } catch (err) {
      logger.error("Error running limit order matching cron:", err);
    }
  });

  // 2. Mock Interest Calculation log: every 5 minutes (was 30s)
  cron.schedule("*/5 * * * *", () => {
    logger.info("Cron interest calculator: calculating dynamic APYs based on pool utilization...");
  });

  // 3. Hourly Funding update helper
  cron.schedule("0 * * * *", () => {
    logger.info("Cron funding rate: updating market skew parameters on-chain...");
  });
}
