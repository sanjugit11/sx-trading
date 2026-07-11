import { z } from "zod";

const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;

export const SIWEAuthSchema = z.object({
  body: z.object({
    address: z.string().regex(ethAddressRegex, "Invalid Ethereum address format"),
    message: z.string().min(1, "SIWE message is required"),
    signature: z.string().min(1, "Signature is required")
  })
});

export const OpenPerpSchema = z.object({
  body: z.object({
    posId: z.number().int().nonnegative().optional(),
    asset: z.string().regex(ethAddressRegex, "Invalid asset token address format"),
    leverage: z.number().int().min(2).max(1000, "Leverage must be between 2x and 1000x"),
    marginAmount: z.number().positive("Margin amount must be positive"),
    isLong: z.boolean(),
    isCross: z.boolean()
  })
});

export const BorrowLendingSchema = z.object({
  body: z.object({
    borrowAsset: z.string().regex(ethAddressRegex, "Invalid borrow asset address"),
    borrowAmount: z.number().positive("Borrow amount must be positive"),
    collateralAsset: z.string().regex(ethAddressRegex, "Invalid collateral asset address"),
    collateralAmount: z.number().positive("Collateral amount must be positive"),
    loanId: z.number().int().positive().optional()
  })
});

export const OpenSpotSchema = z.object({
  body: z.object({
    posId: z.number().int().nonnegative().optional(),
    targetAsset: z.string().regex(ethAddressRegex, "Invalid target asset address"),
    collateralAmount: z.number().positive("Collateral amount must be positive"),
    leverage: z.number().int().min(1).max(10, "Leverage for spot must be between 1x and 10x"),
    isLimit: z.boolean(),
    triggerPrice: z.number().optional()
  })
});

export const PlaceHiddenOrderSchema = z.object({
  body: z.object({
    commitment: z.string().min(1, "Commitment hash is required"),
    proof: z.string().min(1, "ZK-proof parameter payload is required"),
    orderId: z.number().int().nonnegative().optional()
  })
});

export const ExecuteHiddenOrderSchema = z.object({
  body: z.object({
    orderId: z.number().int().nonnegative("Order ID must be non-negative"),
    executionDetails: z.string().min(1, "Execution details payload is required"),
    proof: z.string().min(1, "Execution proof is required")
  })
});
