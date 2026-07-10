import dotenv from "dotenv";
import path from "path";
// Load root .env first (shared keys), then backend/.env overrides (contract addresses etc.)
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
dotenv.config(); // backend/.env — highest priority

export const config = {
  port: process.env.PORT || 3000,
  rpcUrl: process.env.RPC_URL || "https://rpc.hoodi.ethpandaops.io",
  jwtSecret: process.env.JWT_SECRET || "sx-trading-secret-key-12345",

  // Hoodi Testnet deployed addresses
  usdtAddress: process.env.USDT_ADDRESS || "0x2c75e12798e1648058F90E14baB1F1Eef3e4Fdf7",
  oracleAddress: process.env.ORACLE_ADDRESS || "0xEEFDF455fAcBC28225Ad19d11777DB33C8Ad5d78",
  sxptAddress: process.env.SXPT_ADDRESS || "0xd5fb991Af20e9cCb46074755Cc6ccC06b284C2cB",
  sxltAddress: process.env.SXLT_ADDRESS || "0xeC59c3fd2fD491ea106330ABaaCA7907369874Bc",
  sxlsAddress: process.env.SXLS_ADDRESS || "0x43205d5AeC3BC7Fe4cdD183145b30AbDe9489ead",
  sxudAddress: process.env.SXUD_ADDRESS || "0x36d8b489bDd1AD9e69176C9084CC5Dd0662A1b5E",
  sxhopAddress: process.env.SXHOP_ADDRESS || "0x7252800e5724F417af57A5Dc521a37865582424A",
  sxadminAddress: process.env.SXADMIN_ADDRESS || ""
};
