import { ethers } from "ethers";
import { config } from "../config";
import { logger } from "../utils/logger";

const SXPT_ABI = [
  "function positions(uint256) view returns (uint256 id, address user, address asset, uint256 leverage, uint256 marginAmount, uint256 size, bool isLong, bool isCross, uint256 entryPrice, int256 entryFundingIndex, bool isOpen)",
  "function openPerpetualPosition(address asset, uint256 leverage, uint256 marginAmount, bool isLong, bool isCross) external",
  "function closePerpetualPosition(uint256 positionId) external",
  "function getFundingRate(address asset) external view returns (int256)",
  "function applyFundingDeduction(uint256 positionId) external",
  "function getUserPositions(address user) external view returns (uint256[] memory)",
  "function paused() external view returns (bool)",
  "event PerpetualPositionOpened(uint256 indexed positionId, address indexed user, address indexed asset, uint256 leverage, uint256 margin, bool isLong, bool isCross, uint256 entryPrice)",
  "event PerpetualPositionClosed(uint256 indexed positionId, address indexed user, int256 finalPnL, uint256 payoutAmount)"
];

const SXLT_ABI = [
  "function loans(uint256) view returns (uint256 id, address user, address borrowAsset, uint256 borrowAmount, address collateralAsset, uint256 collateralAmount, uint256 timestamp, bool isOpen)",
  "function lendAssets(address asset, uint256 amount) external",
  "function borrowAssets(address borrowAsset, uint256 borrowAmount, address collateralAsset, uint256 collateralAmount) external",
  "function repayLoan(uint256 loanId, uint256 repayAmount) external",
  "function getInterestRate(address asset) external view returns (uint256)",
  "function getLendingYield(address asset) external view returns (uint256)",
  "function getUserLoans(address user) external view returns (uint256[] memory)",
  "function lenderBalance(address, address) view returns (uint256)",
  "function paused() external view returns (bool)",
  "event LoanCreated(uint256 indexed loanId, address indexed user, address borrowAsset, uint256 borrowAmount, address collateralAsset, uint256 collateralAmount)",
  "event LoanRepaid(uint256 indexed loanId, address indexed user, uint256 amountRepaid, uint256 collateralReturned)"
];

const SXLS_ABI = [
  "function positions(uint256) view returns (uint256 id, address user, address targetAsset, uint256 collateralAmount, uint256 leverage, uint256 size, bool isLimit, uint256 triggerPrice, uint256 entryPrice, uint256 takeProfit, uint256 stopLoss, bool isPending, bool isOpen)",
  "function openLeveragedSpot(address targetAsset, uint256 collateralAmount, uint256 leverage, bool isLimit, uint256 triggerPrice) external",
  "function closeLeveragedSpot(uint256 positionId) external",
  "function updateTakeProfit(uint256 positionId, uint256 newTP) external",
  "function updateStopLoss(uint256 positionId, uint256 newSL) external",
  "function getPositionPnL(uint256 positionId) external view returns (int256 pnl, bool isProfit)",
  "function checkAndExecuteLimitOrder(uint256 positionId) external",
  "function getUserPositions(address user) external view returns (uint256[] memory)",
  "function paused() external view returns (bool)",
  "event LeveragedSpotOpened(uint256 indexed positionId, address indexed user, address indexed targetAsset, uint256 leverage, uint256 size, bool isPending)"
];

const SXUD_ABI = [
  "function getAllPositions(address user) external view returns ((uint256 id, address asset, uint256 leverage, uint256 marginAmount, uint256 size, bool isLong, bool isCross, uint256 entryPrice, bool isOpen)[] perps, (uint256 id, address borrowAsset, uint256 borrowAmount, address collateralAsset, uint256 collateralAmount, uint256 currentOwed, bool isOpen)[] loans, (uint256 id, address targetAsset, uint256 collateralAmount, uint256 leverage, uint256 size, bool isLimit, uint256 triggerPrice, uint256 entryPrice, bool isPending, bool isOpen)[] spots)",
  "function getTotalExposure(address user) external view returns (uint256)",
  "function getCrossTerminalCollateral(address user) external view returns (uint256)",
  "function getUnifiedRiskScore(address user) external view returns (uint256)",
  "function refreshDashboard(address user) external returns (uint256 totalExposure, uint256 riskScore)"
];

const SXHOP_ABI = [
  "function placeHiddenOrder(bytes32 orderCommitment, bytes calldata proof) external",
  "function executeHiddenOrder(uint256 orderId, bytes calldata executionDetails, bytes calldata proof) external",
  "function cancelHiddenOrder(uint256 orderId) external",
  "function getOrderStatus(uint256 orderId) external view returns (uint8)",
  "function orderCounter() view returns (uint256)"
];

const SXAdmin_ABI = [
  "function createProposal(address target, bytes calldata data) external returns (uint256)",
  "function approveProposal(uint256 proposalId) external",
  "function executeProposal(uint256 proposalId) external",
  "function killSwitchActive() external view returns (bool)"
];

const Oracle_ABI = [
  "function getPrice(address asset) external view returns (uint256)",
  "function setPrice(address asset, uint256 price) external"
];

const USDT_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)"
];

export class BlockchainService {
  public provider: ethers.JsonRpcProvider;
  public wallet: ethers.Wallet;

  public sxpt: ethers.Contract;
  public sxlt: ethers.Contract;
  public sxls: ethers.Contract;
  public sxud: ethers.Contract;
  public sxhop: ethers.Contract;
  public sxadmin: ethers.Contract | null;
  public oracle: ethers.Contract;
  public usdt: ethers.Contract;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    // Hardhat Account #0 private key for signing backend executions (e.g. Hidden reveal, limit executions, admin updates)
    const mockPrivKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    this.wallet = new ethers.Wallet(mockPrivKey, this.provider);

    // Use read-only provider by default to prevent setting sender address (from)
    // which causes nonce mismatch call exception reverts on Hoodi RPC.
    this.sxpt = new ethers.Contract(config.sxptAddress, SXPT_ABI, this.provider);
    this.sxlt = new ethers.Contract(config.sxltAddress, SXLT_ABI, this.provider);
    this.sxls = new ethers.Contract(config.sxlsAddress, SXLS_ABI, this.provider);
    this.sxud = new ethers.Contract(config.sxudAddress, SXUD_ABI, this.provider);
    this.sxhop = new ethers.Contract(config.sxhopAddress, SXHOP_ABI, this.provider);
    this.sxadmin = config.sxadminAddress
      ? new ethers.Contract(config.sxadminAddress, SXAdmin_ABI, this.provider)
      : null;
    this.oracle = new ethers.Contract(config.oracleAddress, Oracle_ABI, this.provider);
    this.usdt = new ethers.Contract(config.usdtAddress, USDT_ABI, this.provider);
  }

  // Verify SIWE signature
  public verifyWalletSignature(message: string, signature: string, expectedAddress: string): boolean {
    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);
      return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
    } catch (err) {
      logger.error("Failed to verify wallet signature:", err);
      return false;
    }
  }

  // Fetch prices from oracle
  public async getOraclePrice(assetAddress: string): Promise<number> {
    try {
      const priceRaw = await this.oracle.getPrice(assetAddress);
      // Prices are 8 decimals in MockOracle
      return Number(priceRaw) / 10 ** 8;
    } catch (err) {
      logger.error(`Error fetching oracle price for ${assetAddress}:`, err);
      return 1.0; // default backup
    }
  }

  // Update Oracle price (requires admin privilege)
  public async setOraclePrice(assetAddress: string, price: number): Promise<boolean> {
    try {
      const tx = await (this.oracle.connect(this.wallet) as any).setPrice(assetAddress, BigInt(Math.floor(price * 10 ** 8)));
      await tx.wait();
      logger.info(`Oracle price for ${assetAddress} updated to ${price}`);
      return true;
    } catch (err) {
      logger.error("Error setting oracle price:", err);
      return false;
    }
  }

  // Dashboard calculations
  public async getUserDashboardMetrics(userAddress: string) {
    try {
      const totalExposure = await this.sxud.getTotalExposure(userAddress);
      const totalCollateral = await this.sxud.getCrossTerminalCollateral(userAddress);
      const riskScore = await this.sxud.getUnifiedRiskScore(userAddress);
      return {
        totalExposureUSD: ethers.formatEther(totalExposure),
        totalCollateralUSD: ethers.formatEther(totalCollateral),
        riskScore: Number(riskScore)
      };
    } catch (err) {
      logger.error(`Error fetching dashboard metrics for user ${userAddress}:`, err);
      return {
        totalExposureUSD: "0.0",
        totalCollateralUSD: "0.0",
        riskScore: 0
      };
    }
  }

  // Execute reveal hidden order on behalf of executor/backend
  public async executeHiddenOrder(orderId: number, executionDetails: string, proof: string): Promise<string | null> {
    try {
      const tx = await (this.sxhop.connect(this.wallet) as any).executeHiddenOrder(orderId, executionDetails, proof);
      const receipt = await tx.wait();
      logger.info(`Hidden order #${orderId} executed in block ${receipt.blockNumber}`);
      return receipt.hash;
    } catch (err) {
      logger.error(`Error executing hidden order #${orderId}:`, err);
      return null;
    }
  }

  // Check and execute Limit Order
  public async checkAndExecuteLimit(positionId: number): Promise<boolean> {
    try {
      const tx = await (this.sxls.connect(this.wallet) as any).checkAndExecuteLimitOrder(positionId);
      await tx.wait();
      logger.info(`Limit spot position #${positionId} executed successfully.`);
      return true;
    } catch (err) {
      logger.error(`Error executing limit position #${positionId}:`, err);
      return false;
    }
  }

  // Read kill switch status from on-chain SXAdmin contract
  public async getKillSwitchStatus(): Promise<boolean> {
    if (!this.sxadmin) return false;
    try {
      const active: boolean = await this.sxadmin.killSwitchActive();
      return active;
    } catch (err) {
      logger.error("Error reading killSwitchActive from SXAdmin:", err);
      return false;
    }
  }
}

export const blockchainService = new BlockchainService();
