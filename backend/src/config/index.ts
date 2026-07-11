import dotenv from "dotenv";
import path from "path";
// Load root .env first (shared keys), then backend/.env overrides (contract addresses etc.)
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
dotenv.config(); // backend/.env — highest priority

const readEnv = (key: string, fallback = ""): string => process.env[key] ?? fallback;

export const config = {
  port: Number(readEnv("PORT", "3000")) || 3000,
  rpcUrl: readEnv("RPC_URL", "https://rpc.hoodi.ethpandaops.io"),
  jwtSecret: readEnv("JWT_SECRET", "sx-trading-secret-key-12345"),

  // Hoodi Testnet deployed addresses
  usdtAddress: readEnv("USDT_ADDRESS"),
  oracleAddress: readEnv("ORACLE_ADDRESS"),
  sxptAddress: readEnv("SXPT_ADDRESS"),
  sxltAddress: readEnv("SXLT_ADDRESS"),
  sxlsAddress: readEnv("SXLS_ADDRESS"),
  sxudAddress: readEnv("SXUD_ADDRESS"),
  sxhopAddress: readEnv("SXHOP_ADDRESS"),
  sxadminAddress: readEnv("SXADMIN_ADDRESS"),
};
