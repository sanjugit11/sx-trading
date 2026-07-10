export const CONTRACT_ADDRESSES = {
  usdt:    "0x2c75e12798e1648058F90E14baB1F1Eef3e4Fdf7",
  sxpt:    "0xd5fb991Af20e9cCb46074755Cc6ccC06b284C2cB",
  sxlt:    "0xeC59c3fd2fD491ea106330ABaaCA7907369874Bc",
  sxls:    "0x43205d5AeC3BC7Fe4cdD183145b30AbDe9489ead",
  sxud:    "0x36d8b489bDd1AD9e69176C9084CC5Dd0662A1b5E",
  sxhop:   "0x7252800e5724F417af57A5Dc521a37865582424A",
  sxadmin: "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBE6" // Placeholder or actual if deployed
};

export const CONTRACT_ABIS = {
  usdt: [
    "function mint(address to, uint256 amount) external",
    "function balanceOf(address account) external view returns (uint256)",
    "function decimals() external view returns (uint8)",
    "function symbol() external view returns (string)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)"
  ],
  sxpt: [
    "function positions(uint256) view returns (uint256 id, address user, address asset, uint256 leverage, uint256 marginAmount, uint256 size, bool isLong, bool isCross, uint256 entryPrice, int256 entryFundingIndex, bool isOpen)",
    "function openPerpetualPosition(address asset, uint256 leverage, uint256 marginAmount, bool isLong, bool isCross) external",
    "function closePerpetualPosition(uint256 positionId) external",
    "function getFundingRate(address asset) external view returns (int256)",
    "function applyFundingDeduction(uint256 positionId) external",
    "function getUserPositions(address user) external view returns (uint256[] memory)",
    "function paused() external view returns (bool)"
  ],
  sxlt: [
    "function loans(uint256) view returns (uint256 id, address user, address borrowAsset, uint256 borrowAmount, address collateralAsset, uint256 collateralAmount, uint256 timestamp, bool isOpen)",
    "function lendAssets(address asset, uint256 amount) external",
    "function borrowAssets(address borrowAsset, uint256 borrowAmount, address collateralAsset, uint256 collateralAmount) external",
    "function repayLoan(uint256 loanId, uint256 repayAmount) external",
    "function getInterestRate(address asset) external view returns (uint256)",
    "function getLendingYield(address asset) external view returns (uint256)",
    "function getUserLoans(address user) external view returns (uint256[] memory)",
    "function paused() external view returns (bool)",
    "event LoanCreated(uint256 indexed loanId, address indexed user, address borrowAsset, uint256 borrowAmount, address collateralAsset, uint256 collateralAmount)",
    "event LoanRepaid(uint256 indexed loanId, address indexed user, uint256 amountRepaid, uint256 collateralReturned)"
  ],
  sxls: [
    "function positions(uint256) view returns (uint256 id, address user, address targetAsset, uint256 collateralAmount, uint256 leverage, uint256 size, bool isLimit, uint256 triggerPrice, uint256 entryPrice, uint256 takeProfit, uint256 stopLoss, bool isPending, bool isOpen)",
    "function openLeveragedSpot(address targetAsset, uint256 collateralAmount, uint256 leverage, bool isLimit, uint256 triggerPrice) external",
    "function closeLeveragedSpot(uint256 positionId) external",
    "function updateTakeProfit(uint256 positionId, uint256 newTP) external",
    "function updateStopLoss(uint256 positionId, uint256 newSL) external",
    "function getPositionPnL(uint256 positionId) external view returns (int256 pnl, bool isProfit)",
    "function checkAndExecuteLimitOrder(uint256 positionId) external",
    "function getUserPositions(address user) external view returns (uint256[] memory)",
    "function paused() external view returns (bool)"
  ],
  sxhop: [
    "function placeHiddenOrder(bytes32 orderCommitment, bytes calldata proof) external",
    "function executeHiddenOrder(uint256 orderId, bytes calldata executionDetails, bytes calldata proof) external",
    "function cancelHiddenOrder(uint256 orderId) external",
    "function getOrderStatus(uint256 orderId) external view returns (uint8)",
    "function orderCounter() view returns (uint256)"
  ],
  sxadmin: [
    "function createProposal(address target, bytes calldata data) external returns (uint256)",
    "function approveProposal(uint256 proposalId) external",
    "function executeProposal(uint256 proposalId) external",
    "function killSwitchActive() external view returns (bool)"
  ]
};
