import { ethers } from "ethers";
import { config } from "./src/config";

const SXPT_ABI = [
  "function getFundingRate(address asset) external view returns (int256)",
  "function totalLongOI(address) external view returns (uint256)",
  "function totalShortOI(address) external view returns (uint256)"
];

async function main() {
  const provider = new ethers.JsonRpcProvider("https://rpc.hoodi.ethpandaops.io");
  const sxpt = new ethers.Contract(config.sxptAddress, SXPT_ABI, provider);
  const asset = "0x2c75e12798e1648058F90E14baB1F1Eef3e4Fdf7";

  const [fundingRate, totalLong, totalShort] = await Promise.all([
    sxpt.getFundingRate(asset),
    sxpt.totalLongOI(asset),
    sxpt.totalShortOI(asset)
  ]);

  console.log("Asset:", asset);
  console.log("Total Long OI:", totalLong.toString());
  console.log("Total Short OI:", totalShort.toString());
  console.log("Funding Rate Raw:", fundingRate.toString());
  console.log("Funding Rate scaled:", (Number(fundingRate) / 1e18 * 100).toFixed(4) + "% / hr");
}

main().catch(console.error);
