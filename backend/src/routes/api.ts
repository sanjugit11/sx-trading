import { Router } from "express";
import { apiController } from "../controllers/api";
import { authenticateToken } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";
import {
  SIWEAuthSchema,
  OpenPerpSchema,
  BorrowLendingSchema,
  OpenSpotSchema,
  PlaceHiddenOrderSchema,
  ExecuteHiddenOrderSchema
} from "../validators/trading";

const router = Router();

// Auth Endpoints
router.post("/auth/verify", validateRequest(SIWEAuthSchema), apiController.login);

// Authenticated Profiles & Dashboard
router.get("/user/profile", authenticateToken, apiController.getProfile);
router.get("/dashboard", authenticateToken, apiController.getDashboard);

// Market data (oracle price + funding rate)
router.get("/market/:asset", apiController.getMarketData);

// Perpetual endpoints
router.post("/perpetual/open", authenticateToken, validateRequest(OpenPerpSchema), apiController.openPerpetual);
router.post("/perpetual/close/:id", authenticateToken, apiController.closePerpetual);

// Lending endpoints
router.post("/lending/borrow", authenticateToken, validateRequest(BorrowLendingSchema), apiController.borrowLending);
router.post("/lending/repay/:id", authenticateToken, apiController.repayLending);

// Spot endpoints
router.post("/spot/open", authenticateToken, validateRequest(OpenSpotSchema), apiController.openSpot);
router.post("/spot/close/:id", authenticateToken, apiController.closeSpot);
router.patch("/spot/takeprofit/:id", authenticateToken, apiController.updateSpotTakeProfit);

// Hidden Order endpoints
router.post("/hidden/place", authenticateToken, validateRequest(PlaceHiddenOrderSchema), apiController.placeHiddenOrder);
router.post("/hidden/execute", authenticateToken, validateRequest(ExecuteHiddenOrderSchema), apiController.executeHiddenOrder);

// Admin endpoints (public status, no auth needed for reading kill switch)
router.get("/admin/status", apiController.getAdminStatus);

// Indexer endpoints
router.get("/indexer/status", apiController.getIndexerStatus);
router.post("/indexer/trigger", apiController.triggerIndexerPoll);

// Security and Compliance Demo endpoints
router.get("/security/logs", apiController.getSecurityLogs);
router.post("/security/log", apiController.createSecurityLog);

// OneStep KYC endpoints
router.post("/kyc/verify-onestep", authenticateToken, apiController.verifyOneStepKyc);
router.post("/kyc/reset", authenticateToken, apiController.resetKyc);

// SXR Rewards endpoints
router.get("/rewards", authenticateToken, apiController.getRewards);
router.post("/rewards/claim", authenticateToken, apiController.claimRewards);

export default router;
