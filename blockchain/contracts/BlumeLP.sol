// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IChainlinkOracle {
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
    function decimals() external view returns (uint8);
}

/**
 * @title BlumeLP
 * @dev Constant product AMM Pool supporting BLX/USDT swaps, liquidity provisioning rewards (LP tokens),
 * and Price Oracle validation checks to prevent slippage manipulation and sandwich attacks.
 */
contract BlumeLP is ERC20, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token0; // BLX Token
    IERC20 public immutable token1; // USDT Token

    uint256 public reserve0;
    uint256 public reserve1;

    uint256 public constant SWAP_FEE_BPS = 30; // 0.3% trading fee

    // Price Oracle properties
    IChainlinkOracle public priceOracle;
    uint256 public maxOracleDeviationBps = 500; // Max 5% price deviation allowed

    event LiquidityAdded(address indexed provider, uint256 amount0, uint256 amount1, uint256 lpShares);
    event LiquidityRemoved(address indexed provider, uint256 amount0, uint256 amount1, uint256 lpShares);
    event Swap(address indexed swapper, address indexed tokenIn, uint256 amountIn, uint256 amountOut);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event DeviationThresholdUpdated(uint256 oldDeviation, uint256 newDeviation);

    constructor(
        address _token0, 
        address _token1, 
        address _oracleAddress
    ) 
        ERC20("Blume BLX-USDT LP Share", "BLX-USDT-LP")
        Ownable(msg.sender)
    {
        require(_token0 != address(0) && _token1 != address(0), "LP: Zero address not allowed");
        token0 = IERC20(_token0);
        token1 = IERC20(_token1);
        priceOracle = IChainlinkOracle(_oracleAddress);
    }

    /**
     * @dev Add liquidity into the pool, maintaining constant products.
     */
    function addLiquidity(uint256 amount0Desired, uint256 amount1Desired) external nonReentrant returns (uint256 shares) {
        // Run oracle checks before deposit to protect against sandwiching
        validatePriceWithOracle();

        token0.safeTransferFrom(msg.sender, address(this), amount0Desired);
        token1.safeTransferFrom(msg.sender, address(this), amount1Desired);

        uint256 _reserve0 = reserve0;
        uint256 _reserve1 = reserve1;

        uint256 amount0 = amount0Desired;
        uint256 amount1 = amount1Desired;

        uint256 totalSupplyLP = totalSupply();

        if (totalSupplyLP == 0) {
            shares = Math.sqrt(amount0 * amount1);
        } else {
            shares = Math.min(
                (amount0 * totalSupplyLP) / _reserve0,
                (amount1 * totalSupplyLP) / _reserve1
            );
        }

        require(shares > 0, "LP: Insufficient liquidity created");

        reserve0 = _reserve0 + amount0;
        reserve1 = _reserve1 + amount1;

        _mint(msg.sender, shares);

        emit LiquidityAdded(msg.sender, amount0, amount1, shares);
    }

    /**
     * @dev Burn LP shares to withdraw underlying pool reserves.
     */
    function removeLiquidity(uint256 lpShares) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        require(lpShares > 0, "LP: Invalid share count");
        uint256 totalSupplyLP = totalSupply();

        uint256 _reserve0 = reserve0;
        uint256 _reserve1 = reserve1;

        amount0 = (lpShares * _reserve0) / totalSupplyLP;
        amount1 = (lpShares * _reserve1) / totalSupplyLP;

        require(amount0 > 0 && amount1 > 0, "LP: Insufficient reserves returned");

        _burn(msg.sender, lpShares);

        reserve0 = _reserve0 - amount0;
        reserve1 = _reserve1 - amount1;

        token0.safeTransfer(msg.sender, amount0);
        token1.safeTransfer(msg.sender, amount1);

        emit LiquidityRemoved(msg.sender, amount0, amount1, lpShares);
    }

    /**
     * @dev Swaps tokenIn for tokenOut, verifying output slippage margins via oracle bounds.
     */
    function swap(address tokenInAddress, uint256 amountIn, uint256 minAmountOut) external nonReentrant returns (uint256 amountOut) {
        require(tokenInAddress == address(token0) || tokenInAddress == address(token1), "LP: Invalid token");
        require(amountIn > 0, "LP: Amount must be > 0");

        validatePriceWithOracle();

        bool isToken0 = tokenInAddress == address(token0);
        IERC20 tokenIn = isToken0 ? token0 : token1;
        IERC20 tokenOut = isToken0 ? token1 : token0;

        uint256 reserveIn = isToken0 ? reserve0 : reserve1;
        uint256 reserveOut = isToken0 ? reserve1 : reserve0;

        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);

        // Constant Product swap formula
        uint256 amountInWithFee = amountIn * (10000 - SWAP_FEE_BPS);
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 10000) + amountInWithFee;
        amountOut = numerator / denominator;

        require(amountOut >= minAmountOut, "LP: Slippage limit reached");
        require(amountOut < reserveOut, "LP: Exceeds pool reserve");

        if (isToken0) {
            reserve0 = reserveIn + amountIn;
            reserve1 = reserveOut - amountOut;
        } else {
            reserve1 = reserveIn + amountIn;
            reserve0 = reserveOut - amountOut;
        }

        tokenOut.safeTransfer(msg.sender, amountOut);

        emit Swap(msg.sender, tokenInAddress, amountIn, amountOut);
    }

    /**
     * @dev Checks if the spot reserves price ratio deviates too much from the Chainlink feed.
     * Reverts if a manipulation/price deviation event is detected.
     */
    function validatePriceWithOracle() public view {
        if (address(priceOracle) == address(0) || reserve0 == 0 || reserve1 == 0) {
            return; // Skip if oracle is unassigned or pool is unseeded
        }

        (, int256 oraclePrice, , , ) = priceOracle.latestRoundData();
        require(oraclePrice > 0, "LP: Invalid oracle feed data");

        // Scale spot ratio (reserve1 / reserve0) to match oracle decimal precision
        uint8 oracleDecimals = priceOracle.decimals();
        
        // standard Spot Price: reserve1 * 10**decimals / reserve0 (Scaled to match feed precision)
        // BLX is 18 decimals, USDT is 6 decimals. Spot USDT per BLX:
        uint256 spotPrice = (reserve1 * (10**oracleDecimals) * (10**18)) / (reserve0 * (10**6));
        uint256 oPrice = uint256(oraclePrice);

        uint256 diff = spotPrice > oPrice ? spotPrice - oPrice : oPrice - spotPrice;
        uint256 deviationBps = (diff * 10000) / oPrice;

        require(deviationBps <= maxOracleDeviationBps, "LP: Spot ratio deviates too much from Price Oracle");
    }

    // --- Admin Operations ---

    function setPriceOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "LP: Invalid address");
        emit OracleUpdated(address(priceOracle), _oracle);
        priceOracle = IChainlinkOracle(_oracle);
    }

    function setMaxDeviation(uint256 _bps) external onlyOwner {
        require(_bps <= 2000, "LP: Threshold too wide"); // max 20% deviation
        emit DeviationThresholdUpdated(maxOracleDeviationBps, _bps);
        maxOracleDeviationBps = _bps;
    }

    function getAmountOut(address tokenInAddress, uint256 amountIn) external view returns (uint256) {
        require(tokenInAddress == address(token0) || tokenInAddress == address(token1), "LP: Invalid token");
        if (amountIn == 0) return 0;

        bool isToken0 = tokenInAddress == address(token0);
        uint256 reserveIn = isToken0 ? reserve0 : reserve1;
        uint256 reserveOut = isToken0 ? reserve1 : reserve0;

        if (reserveIn == 0 || reserveOut == 0) return 0;

        uint256 amountInWithFee = amountIn * (10000 - SWAP_FEE_BPS);
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 10000) + amountInWithFee;
        return numerator / denominator;
    }
}
