// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IMockOracle {
    function getPrice(address asset) external view returns (uint256);
}

contract SXLS is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Position {
        uint256 id;
        address user;
        address targetAsset;
        uint256 collateralAmount; // Collateral in USDT
        uint256 leverage;          // e.g. 3 for 3x
        uint256 size;              // size = collateralAmount * leverage
        bool isLimit;
        uint256 triggerPrice;      // Limit trigger price
        uint256 entryPrice;
        uint256 takeProfit;
        uint256 stopLoss;
        bool isPending;
        bool isOpen;
    }

    IERC20 public immutable usdt;
    IMockOracle public immutable oracle;

    uint256 public positionCounter;
    mapping(uint256 => Position) public positions;
    mapping(address => uint256[]) public userPositions;

    bool public paused;

    event LeveragedSpotOpened(
        uint256 indexed positionId,
        address indexed user,
        address indexed targetAsset,
        uint256 leverage,
        uint256 size,
        bool isPending
    );
    event TakeProfitUpdated(uint256 indexed positionId, uint256 oldTP, uint256 newTP);
    event StopLossUpdated(uint256 indexed positionId, uint256 oldSL, uint256 newSL);
    event LeveragedSpotClosed(
        uint256 indexed positionId,
        address indexed user,
        int256 finalPnL,
        uint256 payoutAmount
    );
    event LimitOrderExecuted(uint256 indexed positionId, uint256 entryPrice);
    event SystemPaused(bool isPaused);

    modifier whenNotPaused() {
        require(!paused, "SXLS: system paused");
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

    function openLeveragedSpot(
        address targetAsset,
        uint256 collateralAmount,
        uint256 leverage,
        bool isLimit,
        uint256 triggerPrice
    ) external nonReentrant whenNotPaused {
        require(leverage >= 1 && leverage <= 100, "SXLS: leverage out of range");
        require(collateralAmount > 0, "SXLS: collateral must be > 0");

        usdt.safeTransferFrom(msg.sender, address(this), collateralAmount);

        positionCounter++;
        uint256 posId = positionCounter;
        uint256 size = collateralAmount * leverage;

        bool isPending = false;
        uint256 entryPrice = 0;

        if (isLimit) {
            uint256 currentPrice = oracle.getPrice(targetAsset);
            if (currentPrice <= triggerPrice) {
                // Execute limit order immediately if price is already low enough
                entryPrice = currentPrice;
            } else {
                isPending = true;
            }
        } else {
            entryPrice = oracle.getPrice(targetAsset);
        }

        positions[posId] = Position({
            id: posId,
            user: msg.sender,
            targetAsset: targetAsset,
            collateralAmount: collateralAmount,
            leverage: leverage,
            size: size,
            isLimit: isLimit,
            triggerPrice: triggerPrice,
            entryPrice: entryPrice,
            takeProfit: 0,
            stopLoss: 0,
            isPending: isPending,
            isOpen: true
        });

        userPositions[msg.sender].push(posId);

        emit LeveragedSpotOpened(posId, msg.sender, targetAsset, leverage, size, isPending);

        if (!isPending && isLimit) {
            emit LimitOrderExecuted(posId, entryPrice);
        }
    }

    function checkAndExecuteLimitOrder(uint256 positionId) external whenNotPaused {
        Position storage pos = positions[positionId];
        require(pos.isOpen, "SXLS: position not open");
        require(pos.isPending, "SXLS: position not pending");

        uint256 currentPrice = oracle.getPrice(pos.targetAsset);
        require(currentPrice <= pos.triggerPrice, "SXLS: price still above trigger");

        pos.isPending = false;
        pos.entryPrice = currentPrice;

        emit LimitOrderExecuted(positionId, currentPrice);
    }

    function updateTakeProfit(uint256 positionId, uint256 newTP) external whenNotPaused {
        Position storage pos = positions[positionId];
        require(pos.isOpen, "SXLS: position not open");
        require(pos.user == msg.sender, "SXLS: unauthorized");

        uint256 oldTP = pos.takeProfit;
        pos.takeProfit = newTP;

        emit TakeProfitUpdated(positionId, oldTP, newTP);
    }

    function updateStopLoss(uint256 positionId, uint256 newSL) external whenNotPaused {
        Position storage pos = positions[positionId];
        require(pos.isOpen, "SXLS: position not open");
        require(pos.user == msg.sender, "SXLS: unauthorized");

        uint256 oldSL = pos.stopLoss;
        pos.stopLoss = newSL;

        emit StopLossUpdated(positionId, oldSL, newSL);
    }

    function getPositionPnL(uint256 positionId) public view returns (int256 pnl, bool isProfit) {
        Position memory pos = positions[positionId];
        if (!pos.isOpen || pos.isPending) {
            return (0, true);
        }

        uint256 currentPrice = oracle.getPrice(pos.targetAsset);
        if (currentPrice == pos.entryPrice) {
            return (0, true);
        }

        if (currentPrice > pos.entryPrice) {
            pnl = int256(pos.size * (currentPrice - pos.entryPrice) / pos.entryPrice);
            isProfit = true;
        } else {
            pnl = int256(pos.size * (pos.entryPrice - currentPrice) / pos.entryPrice);
            isProfit = false;
        }
    }

    function closeLeveragedSpot(uint256 positionId) external nonReentrant whenNotPaused {
        Position storage pos = positions[positionId];
        require(pos.isOpen, "SXLS: position not open");
        // Allow anyone to close if TP/SL hit, else user must close
        if (msg.sender != pos.user) {
            uint256 currentPrice = oracle.getPrice(pos.targetAsset);
            bool tpTriggered = (pos.takeProfit > 0 && currentPrice >= pos.takeProfit);
            bool slTriggered = (pos.stopLoss > 0 && currentPrice <= pos.stopLoss);
            require(tpTriggered || slTriggered, "SXLS: TP/SL not triggered for public closure");
        }

        pos.isOpen = false;

        uint256 payout;
        int256 signedPnL;

        if (pos.isPending) {
            payout = pos.collateralAmount;
            signedPnL = 0;
        } else {
            (int256 pnl, bool isProfit) = getPositionPnL(positionId);
            if (isProfit) {
                payout = pos.collateralAmount + uint256(pnl);
                signedPnL = pnl;
            } else {
                uint256 loss = uint256(pnl);
                if (loss >= pos.collateralAmount) {
                    payout = 0; // Protected position: loss capped at collateral
                    signedPnL = -int256(pos.collateralAmount);
                } else {
                    payout = pos.collateralAmount - loss;
                    signedPnL = -pnl;
                }
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

        emit LeveragedSpotClosed(positionId, pos.user, signedPnL, payout);
    }

    function getUserPositions(address user) external view returns (uint256[] memory) {
        return userPositions[user];
    }

    function getPositionDetails(uint256 positionId) external view returns (
        address user,
        address targetAsset,
        uint256 collateralAmount,
        uint256 leverage,
        uint256 size,
        bool isLimit,
        uint256 triggerPrice,
        uint256 entryPrice,
        uint256 takeProfit,
        uint256 stopLoss,
        bool isPending,
        bool isOpen
    ) {
        Position memory pos = positions[positionId];
        return (
            pos.user,
            pos.targetAsset,
            pos.collateralAmount,
            pos.leverage,
            pos.size,
            pos.isLimit,
            pos.triggerPrice,
            pos.entryPrice,
            pos.takeProfit,
            pos.stopLoss,
            pos.isPending,
            pos.isOpen
        );
    }
}
