// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IMockOracle {
    function getPrice(address asset) external view returns (uint256);
}

interface IERC20Decimals {
    function decimals() external view returns (uint8);
}

contract SXLT is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Loan {
        uint256 id;
        address user;
        address borrowAsset;
        uint256 borrowAmount;
        address collateralAsset;
        uint256 collateralAmount;
        uint256 timestamp;
        bool isOpen;
    }

    IMockOracle public immutable oracle;

    uint256 public loanCounter;
    mapping(uint256 => Loan) public loans;
    mapping(address => uint256[]) public userLoans;

    // Asset pool tracking
    mapping(address => uint256) public totalLent;
    mapping(address => uint256) public totalBorrowed;
    mapping(address => mapping(address => uint256)) public lenderBalance;

    bool public paused;

    event AssetLent(address indexed user, address indexed asset, uint256 amount);
    event AssetWithdrawn(address indexed user, address indexed asset, uint256 amount);
    event LoanCreated(
        uint256 indexed loanId,
        address indexed user,
        address borrowAsset,
        uint256 borrowAmount,
        address collateralAsset,
        uint256 collateralAmount
    );
    event LoanRepaid(uint256 indexed loanId, address indexed user, uint256 amountRepaid, uint256 collateralReturned);
    event InterestUpdated(address indexed asset, uint256 newRate);
    event SystemPaused(bool isPaused);

    modifier whenNotPaused() {
        require(!paused, "SXLT: system paused");
        _;
    }

    constructor(address _oracle) Ownable(msg.sender) {
        oracle = IMockOracle(_oracle);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit SystemPaused(_paused);
    }

    function getInterestRate(address asset) public view returns (uint256) {
        uint256 lent = totalLent[asset];
        if (lent == 0) {
            return 0.02e18; // Base rate 2%
        }
        uint256 borrowed = totalBorrowed[asset];
        uint256 utilization = borrowed * 1e18 / lent;
        if (utilization > 1e18) {
            utilization = 1e18;
        }
        return 0.02e18 + (utilization * 0.20e18 / 1e18); // Base (2%) + utilization * 20%
    }

    function getLendingYield(address asset) public view returns (uint256) {
        uint256 lent = totalLent[asset];
        if (lent == 0) return 0;
        uint256 borrowed = totalBorrowed[asset];
        uint256 utilization = borrowed * 1e18 / lent;
        uint256 borrowRate = getInterestRate(asset);
        return utilization * borrowRate / 1e18;
    }

    function getDecimals(address asset) public view returns (uint8) {
        try IERC20Decimals(asset).decimals() returns (uint8 dec) {
            return dec;
        } catch {
            return 18;
        }
    }

    function lendAssets(address asset, uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "SXLT: lend amount must be > 0");
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);

        totalLent[asset] += amount;
        lenderBalance[msg.sender][asset] += amount;

        emit AssetLent(msg.sender, asset, amount);
        emit InterestUpdated(asset, getInterestRate(asset));
    }

    function withdrawAssets(address asset, uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "SXLT: withdraw amount > 0");
        require(lenderBalance[msg.sender][asset] >= amount, "SXLT: insufficient balance");

        uint256 liquid = totalLent[asset] - totalBorrowed[asset];
        require(liquid >= amount, "SXLT: insufficient pool liquidity");

        lenderBalance[msg.sender][asset] -= amount;
        totalLent[asset] -= amount;

        IERC20(asset).safeTransfer(msg.sender, amount);

        emit AssetWithdrawn(msg.sender, asset, amount);
        emit InterestUpdated(asset, getInterestRate(asset));
    }

    function borrowAssets(
        address borrowAsset,
        uint256 borrowAmount,
        address collateralAsset,
        uint256 collateralAmount
    ) external nonReentrant whenNotPaused {
        require(borrowAmount > 0, "SXLT: borrow amount > 0");
        require(collateralAmount > 0, "SXLT: collateral amount > 0");

        uint8 collateralDecimals = getDecimals(collateralAsset);
        uint8 borrowDecimals = getDecimals(borrowAsset);

        uint256 collateralPrice = oracle.getPrice(collateralAsset);
        uint256 borrowPrice = oracle.getPrice(borrowAsset);

        uint256 collateralValueUSD = collateralAmount * collateralPrice * 1e18 / (10 ** collateralDecimals);
        uint256 borrowValueUSD = borrowAmount * borrowPrice * 1e18 / (10 ** borrowDecimals);

        // collateralValueUSD >= borrowValueUSD * 2.5 (250% LTV ratio)
        require(collateralValueUSD * 100 >= borrowValueUSD * 250, "SXLT: insufficient collateral for 250% LTV");

        uint256 available = totalLent[borrowAsset] - totalBorrowed[borrowAsset];
        require(available >= borrowAmount, "SXLT: insufficient pool liquidity");

        IERC20(collateralAsset).safeTransferFrom(msg.sender, address(this), collateralAmount);
        IERC20(borrowAsset).safeTransfer(msg.sender, borrowAmount);

        totalBorrowed[borrowAsset] += borrowAmount;

        loanCounter++;
        uint256 loanId = loanCounter;

        loans[loanId] = Loan({
            id: loanId,
            user: msg.sender,
            borrowAsset: borrowAsset,
            borrowAmount: borrowAmount,
            collateralAsset: collateralAsset,
            collateralAmount: collateralAmount,
            timestamp: block.timestamp,
            isOpen: true
        });

        userLoans[msg.sender].push(loanId);

        emit LoanCreated(
            loanId,
            msg.sender,
            borrowAsset,
            borrowAmount,
            collateralAsset,
            collateralAmount
        );
        emit InterestUpdated(borrowAsset, getInterestRate(borrowAsset));
    }

    function repayLoan(uint256 loanId, uint256 repayAmount) external nonReentrant whenNotPaused {
        Loan storage loan = loans[loanId];
        require(loan.isOpen, "SXLT: loan not open");
        require(repayAmount > 0, "SXLT: repay amount must be > 0");

        uint256 rate = getInterestRate(loan.borrowAsset);
        uint256 timeElapsed = block.timestamp - loan.timestamp;
        uint256 interest = loan.borrowAmount * rate * timeElapsed / (365 days * 1e18);
        uint256 totalOwed = loan.borrowAmount + interest;

        uint256 actualRepay = repayAmount;
        if (actualRepay > totalOwed) {
            actualRepay = totalOwed;
        }

        IERC20(loan.borrowAsset).safeTransferFrom(msg.sender, address(this), actualRepay);

        if (actualRepay == totalOwed) {
            loan.isOpen = false;
            IERC20(loan.collateralAsset).safeTransfer(loan.user, loan.collateralAmount);

            if (totalBorrowed[loan.borrowAsset] >= loan.borrowAmount) {
                totalBorrowed[loan.borrowAsset] -= loan.borrowAmount;
            } else {
                totalBorrowed[loan.borrowAsset] = 0;
            }

            emit LoanRepaid(loanId, loan.user, actualRepay, loan.collateralAmount);
        } else {
            uint256 remainingDebt = totalOwed - actualRepay;
            if (totalBorrowed[loan.borrowAsset] >= loan.borrowAmount) {
                totalBorrowed[loan.borrowAsset] -= (loan.borrowAmount - remainingDebt);
            }
            loan.borrowAmount = remainingDebt;
            loan.timestamp = block.timestamp;

            emit LoanRepaid(loanId, loan.user, actualRepay, 0);
        }

        emit InterestUpdated(loan.borrowAsset, getInterestRate(loan.borrowAsset));
    }

    function getUserLoans(address user) external view returns (uint256[] memory) {
        return userLoans[user];
    }
}
