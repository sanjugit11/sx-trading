

export const CONTRACT_ADDRESSES = {
  usdt:    "0x7EdE77F55C8D6ce1c7cB8B501a5f57FfFE236234",
  sxpt:    "0x44087077C55fD0bEa8DA21280713A4449cCDe3E6",
  sxlt:    "0x8c1Dfa85296d09727d1dFb875d6d89a91060C735",
  sxls:    "0x4CBe9bb948E25DDB6AcaB1331a6567B6EdA9B6Fd",
  sxud:    "0x618f2757a2a3Cb7FE31dB97D152308fBf1962D9a",
  sxhop:   "0x98abC10B7A8A9C10993458447493E3D31CE23632",
  sxadmin: "0x5900491f857DA2B1fbD0c4143cB4E3183c98Cd24"
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
    "function lenderBalance(address, address) view returns (uint256)",
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
    "function killSwitchActive() external view returns (bool)",
    "function activateKillSwitch() external",
    "function deactivateKillSwitch() external",
    "function proposalCounter() external view returns (uint256)",
    "function proposals(uint256) external view returns (uint256 id, address target, bytes data, uint256 approvalCount, bool executed)",
    "function registerMasterDevice(address deviceAddress) external",
    "function masterDevices(uint256 index) external view returns (address)",
    "function isMasterDevice(address deviceAddress) external view returns (bool)",
    "event KillSwitchActivated()",
    "event KillSwitchDeactivated()",
    "event ProposalCreated(uint256 indexed proposalId, address indexed target)",
    "event ProposalApproved(uint256 indexed proposalId, address indexed approver)",
    "event ProposalExecuted(uint256 indexed proposalId)"
  ]
};
