import { ethers } from "ethers";
import { config } from "./src/config";

const SXPT_ABI = [
  "function getUserPositions(address user) external view returns (uint256[])",
  "function positions(uint256) external view returns (tuple(uint256 id, address user, address asset, uint256 leverage, uint256 marginAmount, uint256 size, bool isLong, bool isCross, uint256 entryPrice, int256 entryFundingIndex, bool isOpen))"
];

async function main() {
  const provider = new ethers.JsonRpcProvider("https://rpc.hoodi.ethpandaops.io");
  const sxpt = new ethers.Contract(config.sxptAddress, SXPT_ABI, provider);
  const userAddress = "0x1034aad10ef61534ea4df59cd040b3e4418c5e78";

  const posIds = await sxpt.getUserPositions(userAddress);
  console.log("On-chain Position IDs for user:", posIds.map((id: any) => id.toString()));

  for (const id of posIds) {
    const pos = await sxpt.positions(id);
    console.log(`On-chain Position #${id}:`, {
      id: pos.id.toString(),
      user: pos.user,
      asset: pos.asset,
      leverage: pos.leverage.toString(),
      marginAmount: ethers.formatEther(pos.marginAmount),
      size: ethers.formatEther(pos.size),
      isLong: pos.isLong,
      isCross: pos.isCross,
      entryPrice: ethers.formatEther(pos.entryPrice),
      isOpen: pos.isOpen
    });
  }
}

main().catch(console.error);
