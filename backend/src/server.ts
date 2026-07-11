import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config";
import router from "./routes/api";
import { logger } from "./utils/logger";
import { initWebSocketServer } from "./websocket/server";
import { startBackgroundJobs } from "./scheduler/jobs";
import { startEventIndexer } from "./blockchain/indexer";
import { PrismaClient } from "@prisma/client";

const app = express();
const server = http.createServer(app);
const prisma = new PrismaClient();

// Security and utility Middlewares
app.use(helmet());
app.use(cors({
  origin: ["http://localhost:3001", "http://127.0.0.1:3001"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

// Routes
app.use("/api", router);

// Health check endpoint
app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({ status: "healthy", database: "connected" });
  } catch (err) {
    logger.error("Health check db query failure:", err);
    return res.status(500).json({ status: "unhealthy", database: "disconnected" });
  }
});

// Initialize real-time WebSocket connection
initWebSocketServer(server);

// Start background cron schedulers
startBackgroundJobs();

// Start blockchain event listeners
startEventIndexer();

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error("Unhandled runtime exception:", err);
  return res.status(500).json({ error: "Internal Server Error" });
});

// Start listening if run directly (not through tests)
if (process.env.NODE_ENV !== "test") {
  server.listen(config.port, () => {
    logger.info(`====================================================`);
    logger.info(`SX Trading Backend running on port ${config.port}`);
    logger.info(`RPC Provider URL: ${config.rpcUrl}`);
    logger.info(`====================================================`);
  });
}

export { app, server };
