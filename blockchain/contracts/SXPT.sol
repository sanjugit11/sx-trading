// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IMockOracle {
    function getPrice(address asset) external view returns (uint256);
}

contract SXPT is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Position {
        uint256 id;
        address user;
        address asset;
        uint256 leverage;      // 2 to 1000
        uint256 marginAmount;  // Margin in USDT
        uint256 size;          // size = marginAmount * leverage
        bool isLong;
        bool isCross;
        uint256 entryPrice;    // Price from Oracle
        int256 entryFundingIndex;
        bool isOpen;
    }

    IERC20 public immutable usdt;
    IMockOracle public immutable oracle;

    uint256 public positionCounter;
    mapping(uint256 => Position) public positions;
    mapping(address => uint256[]) public userPositions;

    // Open Interest (OI) tracking
    mapping(address => uint256) public totalLongOI;
    mapping(address => uint256) public totalShortOI;

    // Cumulative funding index per asset (1e18 precision)
    mapping(address => int256) public cumulativeFundingIndex;
    mapping(address => uint256) public lastFundingTime;

    uint256 public constant FUNDING_INTERVAL = 1 hours;
    int256 public constant MAX_FUNDING_RATE = 0.003e18; // 0.3% max per hour

    bool public paused;

    event PerpetualPositionOpened(
        uint256 indexed positionId,
        address indexed user,
        address indexed asset,
        uint256 leverage,
        uint256 margin,
        bool isLong,
        bool isCross,
        uint256 entryPrice
    );
    event PerpetualPositionClosed(
        uint256 indexed positionId,
        address indexed user,
        int256 finalPnL,
        uint256 payoutAmount
    );
    event FundingRateApplied(
        uint256 indexed positionId,
        int256 fundingDeduction,
        int256 currentFundingIndex
    );
    event SystemPaused(bool isPaused);

    modifier whenNotPaused() {
        require(!paused, "SXPT: system paused");
        _;
    }

    constructor(address _usdt, address _oracle) Ownable(msg.sender) {
        usdt = IERC20(_usdt);
        oracle = IMockOracle(_oracle);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit SystemPaused(_paused);
    }

    function getFundingRate(address asset) public view returns (int256) {
        uint256 longOI = totalLongOI[asset];
        uint256 shortOI = totalShortOI[asset];
        if (longOI + shortOI == 0) {
            return 0;
        }
        // Skew = (Long - Short) / (Long + Short)
        int256 skew = (int256(longOI) - int256(shortOI)) * 1e18 / int256(longOI + shortOI);
        return skew * MAX_FUNDING_RATE / 1e18;
    }

    function updateFunding(address asset) public {
        if (lastFundingTime[asset] == 0) {
            lastFundingTime[asset] = block.timestamp;
            return;
        }
        uint256 timeElapsed = block.timestamp - lastFundingTime[asset];
        if (timeElapsed >= FUNDING_INTERVAL) {
            int256 rate = getFundingRate(asset);
            uint256 intervals = timeElapsed / FUNDING_INTERVAL;
            cumulativeFundingIndex[asset] += rate * int256(intervals);
            lastFundingTime[asset] += intervals * FUNDING_INTERVAL;
        }
    }

    function openPerpetualPosition(
        address asset,
        uint256 leverage,
        uint256 marginAmount,
        bool isLong,
        bool isCross
    ) external nonReentrant whenNotPaused {
        require(leverage >= 2 && leverage <= 1000, "SXPT: leverage out of range");
        require(marginAmount > 0, "SXPT: margin must be > 0");

        // Transfer USDT margin from user
        usdt.safeTransferFrom(msg.sender, address(this), marginAmount);

        updateFunding(asset);

        positionCounter++;
        uint256 posId = positionCounter;
        uint256 size = marginAmount * leverage;
        uint256 entryPrice = oracle.getPrice(asset);

        positions[posId] = Position({
            id: posId,
            user: msg.sender,
            asset: asset,
            leverage: leverage,
            marginAmount: marginAmount,
            size: size,
            isLong: isLong,
            isCross: isCross,
            entryPrice: entryPrice,
            entryFundingIndex: cumulativeFundingIndex[asset],
            isOpen: true
        });

        userPositions[msg.sender].push(posId);

        if (isLong) {
            totalLongOI[asset] += size;
        } else {
            totalShortOI[asset] += size;
        }

        emit PerpetualPositionOpened(
            posId,
            msg.sender,
            asset,
            leverage,
            marginAmount,
            isLong,
            isCross,
            entryPrice
        );
    }

    function _applyFundingDeduction(uint256 positionId) internal {
        Position storage pos = positions[positionId];
        require(pos.isOpen, "SXPT: position closed");
        updateFunding(pos.asset);

        int256 currentIdx = cumulativeFundingIndex[pos.asset];
        int256 diff = currentIdx - pos.entryFundingIndex;
        if (diff == 0) return;

        int256 fundingDeduction;
        if (pos.isLong) {
            fundingDeduction = int256(pos.size) * diff / 1e18;
        } else {
            fundingDeduction = int256(pos.size) * (-diff) / 1e18;
        }

        if (fundingDeduction > 0) {
            uint256 deduction = uint256(fundingDeduction);
            if (deduction > pos.marginAmount) {
                pos.marginAmount = 0; // Protected position: capped at 0 loss
            } else {
                pos.marginAmount -= deduction;
            }
        } else {
            pos.marginAmount += uint256(-fundingDeduction);
        }

        pos.entryFundingIndex = currentIdx;
        emit FundingRateApplied(positionId, fundingDeduction, currentIdx);
    }

    function applyFundingDeduction(uint256 positionId) public nonReentrant whenNotPaused {
        _applyFundingDeduction(positionId);
    }

    function getPositionPnL(uint256 positionId) public view returns (int256 pnl, bool isProfit) {
        Position memory pos = positions[positionId];
        if (!pos.isOpen) {
            return (0, true);
        }
        uint256 currentPrice = oracle.getPrice(pos.asset);

        if (currentPrice == pos.entryPrice) {
            return (0, true);
        }

        if (pos.isLong) {
            if (currentPrice > pos.entryPrice) {
                pnl = int256(pos.size * (currentPrice - pos.entryPrice) / pos.entryPrice);
                isProfit = true;
            } else {
                pnl = int256(pos.size * (pos.entryPrice - currentPrice) / pos.entryPrice);
                isProfit = false;
            }
        } else {
            if (currentPrice < pos.entryPrice) {
                pnl = int256(pos.size * (pos.entryPrice - currentPrice) / pos.entryPrice);
                isProfit = true;
            } else {
                pnl = int256(pos.size * (currentPrice - pos.entryPrice) / pos.entryPrice);
                isProfit = false;
            }
        }
    }

    function closePerpetualPosition(uint256 positionId) external nonReentrant whenNotPaused {
        Position storage pos = positions[positionId];
        require(pos.isOpen, "SXPT: position not open");
        require(pos.user == msg.sender, "SXPT: unauthorized");

        // 1. Apply outstanding funding
        _applyFundingDeduction(positionId);

        // 2. Compute PnL
        (int256 pnl, bool isProfit) = getPositionPnL(positionId);

        pos.isOpen = false;

        // Update open interest
        if (pos.isLong) {
            if (totalLongOI[pos.asset] >= pos.size) {
                totalLongOI[pos.asset] -= pos.size;
            } else {
                totalLongOI[pos.asset] = 0;
            }
        } else {
            if (totalShortOI[pos.asset] >= pos.size) {
                totalShortOI[pos.asset] -= pos.size;
            } else {
                totalShortOI[pos.asset] = 0;
            }
        }

        uint256 payout;
        int256 signedPnL;
        if (isProfit) {
            payout = pos.marginAmount + uint256(pnl);
            signedPnL = pnl;
        } else {
            uint256 loss = uint256(pnl);
            if (loss >= pos.marginAmount) {
                payout = 0; // Protected position: loss capped at margin
                signedPnL = -int256(pos.marginAmount);
            } else {
                payout = pos.marginAmount - loss;
                signedPnL = -pnl;
            }
        }

        if (payout > 0) {
            uint256 bal = usdt.balanceOf(address(this));
            if (payout > bal) {
                payout = bal;
            }
            if (payout > 0) {
                usdt.safeTransfer(pos.user, payout);
            }
        }

        emit PerpetualPositionClosed(positionId, msg.sender, signedPnL, payout);
    }

    function getPositionDetails(uint256 positionId) external view returns (
        address user,
        address asset,
        uint256 leverage,
        uint256 marginAmount,
        uint256 size,
        bool isLong,
        bool isCross,
        uint256 entryPrice,
        int256 entryFundingIndex,
        bool isOpen
    ) {
        Position memory pos = positions[positionId];
        return (
            pos.user,
            pos.asset,
            pos.leverage,
            pos.marginAmount,
            pos.size,
            pos.isLong,
            pos.isCross,
            pos.entryPrice,
            pos.entryFundingIndex,
            pos.isOpen
        );
    }

    function getUserPositions(address user) external view returns (uint256[] memory) {
        return userPositions[user];
    }
}
