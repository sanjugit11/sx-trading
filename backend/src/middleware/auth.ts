import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { config } from "../config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    address: string;
    kycStatus: string;
  };
}

// Helper to generate a token
export function generateSessionToken(address: string): string {
  const hmac = crypto.createHmac("sha256", config.jwtSecret);
  hmac.update(address.toLowerCase());
  const signature = hmac.digest("hex");
  return `${address.toLowerCase()}.${signature}`;
}

export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Token missing" });
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return res.status(403).json({ error: "Forbidden: Invalid token format" });
  }

  const [address, signature] = parts;

  // Verify HMAC signature
  const hmac = crypto.createHmac("sha256", config.jwtSecret);
  hmac.update(address.toLowerCase());
  const expectedSignature = hmac.digest("hex");

  if (signature !== expectedSignature) {
    return res.status(403).json({ error: "Forbidden: Signature mismatch" });
  }

  try {
    // Find or create user in DB
    let user = await prisma.user.findUnique({
      where: { address: address.toLowerCase() }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          address: address.toLowerCase(),
          kycStatus: "APPROVED" // Auto-approve for testing convenience
        }
      });
      // Initialize wallet
      await prisma.wallet.create({
        data: {
          userId: user.id,
          address: address.toLowerCase(),
          balanceUSD: 10000.0 // Start with $10,000 mock funds
        }
      });
    }

    req.user = {
      id: user.id,
      address: user.address,
      kycStatus: user.kycStatus
    };
    next();
  } catch (err) {
    return res.status(500).json({ error: "Internal database verification error" });
  }
}
