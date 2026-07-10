// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";

interface ISXPT {
    function getUserPositions(address user) external view returns (uint256[] memory);
    function positions(uint256 id) external view returns (
        uint256 id_,
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
    );
}

interface ISXLT {
    function getUserLoans(address user) external view returns (uint256[] memory);
    function loans(uint256 id) external view returns (
        uint256 id_,
        address user,
        address borrowAsset,
        uint256 borrowAmount,
        address collateralAsset,
        uint256 collateralAmount,
        uint256 timestamp,
        bool isOpen
    );
    function getInterestRate(address asset) external view returns (uint256);
    function getDecimals(address asset) external view returns (uint8);
}

interface ISXLS {
    function getUserPositions(address user) external view returns (uint256[] memory);
    function positions(uint256 id) external view returns (
        uint256 id_,
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
    );
}

interface IMockOracle {
    function getPrice(address asset) external view returns (uint256);
}

contract SXUD is Ownable {
    ISXPT public immutable sxpt;
    ISXLT public immutable sxlt;
    ISXLS public immutable sxls;
    IMockOracle public immutable oracle;

    struct PerpPositionView {
        uint256 id;
        address asset;
        uint256 leverage;
        uint256 marginAmount;
        uint256 size;
        bool isLong;
        bool isCross;
        uint256 entryPrice;
        bool isOpen;
    }

    struct LoanView {
        uint256 id;
        address borrowAsset;
        uint256 borrowAmount;
        address collateralAsset;
        uint256 collateralAmount;
        uint256 currentOwed;
        bool isOpen;
    }

    struct SpotPositionView {
        uint256 id;
        address targetAsset;
        uint256 collateralAmount;
        uint256 leverage;
        uint256 size;
        bool isLimit;
        uint256 triggerPrice;
        uint256 entryPrice;
        bool isPending;
        bool isOpen;
    }

    event DashboardUpdated(address indexed user, uint256 totalExposure, uint256 riskScore);

    constructor(
        address _sxpt,
        address _sxlt,
        address _sxls,
        address _oracle
    ) Ownable(msg.sender) {
        sxpt = ISXPT(_sxpt);
        sxlt = ISXLT(_sxlt);
        sxls = ISXLS(_sxls);
        oracle = IMockOracle(_oracle);
    }

    function getAllPositions(address user) external view returns (
        PerpPositionView[] memory perps,
        LoanView[] memory loans,
        SpotPositionView[] memory spots
    ) {
        // 1. Fetch Perpetual Positions
        uint256[] memory perpIds = sxpt.getUserPositions(user);
        perps = new PerpPositionView[](perpIds.length);
        for (uint256 i = 0; i < perpIds.length; i++) {
            (
                , , address asset, uint256 leverage, uint256 marginAmount, uint256 size,
                bool isLong, bool isCross, uint256 entryPrice, , bool isOpen
            ) = sxpt.positions(perpIds[i]);
            perps[i] = PerpPositionView(perpIds[i], asset, leverage, marginAmount, size, isLong, isCross, entryPrice, isOpen);
        }

        // 2. Fetch Loans
        uint256[] memory loanIds = sxlt.getUserLoans(user);
        loans = new LoanView[](loanIds.length);
        for (uint256 i = 0; i < loanIds.length; i++) {
            (
                , , address borrowAsset, uint256 borrowAmount, address collateralAsset,
                uint256 collateralAmount, uint256 timestamp, bool isOpen
            ) = sxlt.loans(loanIds[i]);

            uint256 currentOwed = 0;
            if (isOpen) {
                uint256 rate = sxlt.getInterestRate(borrowAsset);
                uint256 timeElapsed = block.timestamp - timestamp;
                uint256 interest = borrowAmount * rate * timeElapsed / (365 days * 1e18);
                currentOwed = borrowAmount + interest;
            }

            loans[i] = LoanView(loanIds[i], borrowAsset, borrowAmount, collateralAsset, collateralAmount, currentOwed, isOpen);
        }

        // 3. Fetch Spot Positions
        uint256[] memory spotIds = sxls.getUserPositions(user);
        spots = new SpotPositionView[](spotIds.length);
        for (uint256 i = 0; i < spotIds.length; i++) {
            (
                , , address targetAsset, uint256 collateralAmount, uint256 leverage, uint256 size,
                bool isLimit, uint256 triggerPrice, uint256 entryPrice, , , bool isPending, bool isOpen
            ) = sxls.positions(spotIds[i]);
            spots[i] = SpotPositionView(spotIds[i], targetAsset, collateralAmount, leverage, size, isLimit, triggerPrice, entryPrice, isPending, isOpen);
        }
    }

    function getTotalExposure(address user) public view returns (uint256) {
        uint256 total = 0;

        // 1. Perp exposure (active sizes in USD value)
        uint256[] memory perpIds = sxpt.getUserPositions(user);
        for (uint256 i = 0; i < perpIds.length; i++) {
            (,,,,, uint256 size,,,,, bool isOpen) = sxpt.positions(perpIds[i]);
            if (isOpen) {
                total += size; // size is stored in USD/USDT value
            }
        }

        // 2. Spot exposure (active sizes in USD value)
        uint256[] memory spotIds = sxls.getUserPositions(user);
        for (uint256 i = 0; i < spotIds.length; i++) {
            (,,,,, uint256 size,,,,,,, bool isOpen) = sxls.positions(spotIds[i]);
            if (isOpen) {
                total += size; // size is stored in USD/USDT value
            }
        }

        // 3. Lending borrow exposure
        uint256[] memory loanIds = sxlt.getUserLoans(user);
        for (uint256 i = 0; i < loanIds.length; i++) {
            (, , address borrowAsset, uint256 borrowAmount, , , , bool isOpen) = sxlt.loans(loanIds[i]);
            if (isOpen) {
                uint8 decimals = sxlt.getDecimals(borrowAsset);
                uint256 price = oracle.getPrice(borrowAsset);
                uint256 price18 = price * 1e10; // Scale 8-decimal oracle price to 18 decimals
                total += borrowAmount * price18 / (10 ** decimals);
            }
        }

        return total;
    }

    function getCrossTerminalCollateral(address user) public view returns (uint256) {
        uint256 total = 0;

        // 1. Perp margin
        uint256[] memory perpIds = sxpt.getUserPositions(user);
        for (uint256 i = 0; i < perpIds.length; i++) {
            (,,,, uint256 marginAmount,,,,,, bool isOpen) = sxpt.positions(perpIds[i]);
            if (isOpen) {
                total += marginAmount;
            }
        }

        // 2. Spot collateral
        uint256[] memory spotIds = sxls.getUserPositions(user);
        for (uint256 i = 0; i < spotIds.length; i++) {
            (,,, uint256 collateralAmount,,,,,,,,, bool isOpen) = sxls.positions(spotIds[i]);
            if (isOpen) {
                total += collateralAmount;
            }
        }

        // 3. Lending collateral
        uint256[] memory loanIds = sxlt.getUserLoans(user);
        for (uint256 i = 0; i < loanIds.length; i++) {
            (, , , , address collateralAsset, uint256 collateralAmount, , bool isOpen) = sxlt.loans(loanIds[i]);
            if (isOpen) {
                uint8 decimals = sxlt.getDecimals(collateralAsset);
                uint256 price = oracle.getPrice(collateralAsset);
                uint256 price18 = price * 1e10; // Scale 8-decimal oracle price to 18 decimals
                total += collateralAmount * price18 / (10 ** decimals);
            }
        }

        return total;
    }

    function getUnifiedRiskScore(address user) public view returns (uint256) {
        uint256 exposure = getTotalExposure(user);
        if (exposure == 0) {
            return 0;
        }
        uint256 collateral = getCrossTerminalCollateral(user);
        if (collateral == 0) {
            return 100; // Max risk if exposure exists with no collateral
        }
        // Score = (exposure * 100) / collateral
        uint256 score = (exposure * 100) / collateral;
        if (score > 100) {
            return 100;
        }
        return score;
    }

    function refreshDashboard(address user) external returns (uint256 totalExposure, uint256 riskScore) {
        totalExposure = getTotalExposure(user);
        riskScore = getUnifiedRiskScore(user);
        emit DashboardUpdated(user, totalExposure, riskScore);
    }
}
