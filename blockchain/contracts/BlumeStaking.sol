// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./stBLXToken.sol";
import "./BLXToken.sol";

/**
 * @title BlumeStaking
 * @dev Staking manager supporting classic locking rewards, liquid staking stBLX mints,
 * and early withdrawal penalties to incentivize long-term participants.
 */
contract BlumeStaking is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    using SafeERC20 for BLXToken;

    BLXToken public immutable blxToken;
    stBLXToken public immutable stBlxToken;

    // Classic Staking Structures
    struct Stake {
        uint256 amount;
        uint256 rewardDebt;
        uint256 lockTimestamp;
        uint256 unlockTimestamp;
        uint256 lockPeriodId;
    }

    struct LockPeriod {
        uint256 duration; // in seconds
        uint256 apy;      // base APY in percentage points (e.g. 10 = 10%)
    }

    LockPeriod[] public lockPeriods;

    // Staking pool state
    uint256 public totalClassicStaked;
    uint256 public accRewardPerShare;
    uint256 public lastRewardTimestamp;
    uint256 public rewardRatePerSecond; // Rewards distributed per second to classic stakers

    mapping(address => Stake[]) public userStakes;

    // Liquid Staking Pool state
    uint256 public totalLiquidStakedBLX;
    uint256 public liquidStakingAPY = 12; // 12% APY for liquid staking
    uint256 public lastLiquidRewardTimestamp;

    // Early exit penalty parameter (1500 bps = 15% penalty on staked principal)
    uint256 public earlyExitPenaltyBps = 1500;

    event ClassicStaked(address indexed user, uint256 amount, uint256 lockPeriodId, uint256 unlockTimestamp);
    event ClassicUnstaked(address indexed user, uint256 amount, uint256 rewardClaimed, uint256 penaltyDeducted);
    event RewardClaimed(address indexed user, uint256 amount);
    event LiquidStaked(address indexed user, uint256 blxAmount, uint256 stBlxAmount);
    event LiquidUnstaked(address indexed user, uint256 stBlxAmount, uint256 blxAmount);
    event EarlyExitPenaltyUpdated(uint256 oldPenalty, uint256 newPenalty);

    constructor(
        address _blxToken,
        address _stBlxToken
    ) Ownable(msg.sender) {
        require(_blxToken != address(0) && _stBlxToken != address(0), "Addresses cannot be zero");
        blxToken = BLXToken(_blxToken);
        stBlxToken = stBLXToken(_stBlxToken);

        // Define default lock periods
        lockPeriods.push(LockPeriod(0, 5));           // Flexible, 5% APY
        lockPeriods.push(LockPeriod(30 days, 10));    // 30 Days, 10% APY
        lockPeriods.push(LockPeriod(90 days, 18));    // 90 Days, 18% APY
        lockPeriods.push(LockPeriod(180 days, 28));   // 180 Days, 28% APY

        lastRewardTimestamp = block.timestamp;
        lastLiquidRewardTimestamp = block.timestamp;
        rewardRatePerSecond = 1e16; // 0.01 BLX per second initially
    }

    // --- Classic Staking Functions ---

    /**
     * @dev Deposit BLX into classic staking, choosing a lockup period.
     */
    function stakeClassic(uint256 _amount, uint256 _lockPeriodId) external nonReentrant {
        require(_amount > 0, "Amount must be greater than 0");
        require(_lockPeriodId < lockPeriods.length, "Invalid lock period");

        updatePool();

        blxToken.safeTransferFrom(msg.sender, address(this), _amount);

        uint256 rewardDebt = (_amount * accRewardPerShare) / 1e12;
        uint256 unlockTimestamp = block.timestamp + lockPeriods[_lockPeriodId].duration;

        userStakes[msg.sender].push(Stake({
            amount: _amount,
            rewardDebt: rewardDebt,
            lockTimestamp: block.timestamp,
            unlockTimestamp: unlockTimestamp,
            lockPeriodId: _lockPeriodId
        }));

        totalClassicStaked += _amount;

        emit ClassicStaked(msg.sender, _amount, _lockPeriodId, unlockTimestamp);
    }

    /**
     * @dev Claim rewards across all active classic stakes.
     */
    function claimClassicRewards() public nonReentrant {
        updatePool();
        uint256 pendingTotal = 0;

        Stake[] storage stakes = userStakes[msg.sender];
        for (uint256 i = 0; i < stakes.length; i++) {
            Stake storage s = stakes[i];
            if (s.amount > 0) {
                uint256 shareReward = (s.amount * accRewardPerShare) / 1e12;
                uint256 pending = shareReward - s.rewardDebt;
                
                // Scale rewards based on lock period APY (Flexible APY = 5% as base ratio)
                uint256 scale = lockPeriods[s.lockPeriodId].apy;
                pending = (pending * scale) / 5;

                if (pending > 0) {
                    pendingTotal += pending;
                    s.rewardDebt = shareReward;
                }
            }
        }

        if (pendingTotal > 0) {
            mintRewards(msg.sender, pendingTotal);
            emit RewardClaimed(msg.sender, pendingTotal);
        }
    }

    /**
     * @dev Unstake BLX tokens. If the lock period has NOT expired, allows unstaking
     * but deducts a 15% penalty fee from their principal and forfeits accumulated rewards.
     */
    function unstakeClassic(uint256 _stakeIndex) external nonReentrant {
        Stake[] storage stakes = userStakes[msg.sender];
        require(_stakeIndex < stakes.length, "Stake index out of bounds");
        Stake storage s = stakes[_stakeIndex];
        require(s.amount > 0, "Already unstaked");

        updatePool();

        uint256 pending = 0;
        uint256 penalty = 0;
        uint256 amountToReturn = s.amount;

        if (block.timestamp < s.unlockTimestamp) {
            // Early withdrawal penalty: deduct 15% of staked principal
            penalty = (s.amount * earlyExitPenaltyBps) / 10000;
            amountToReturn = s.amount - penalty;
            
            // Transfer penalty to owner/treasury
            if (penalty > 0) {
                blxToken.safeTransfer(owner(), penalty);
            }
            // Forfeit all pending rewards on early exit
            pending = 0;
        } else {
            // Normal exit: Calculate pending rewards
            uint256 shareReward = (s.amount * accRewardPerShare) / 1e12;
            pending = shareReward - s.rewardDebt;
            uint256 scale = lockPeriods[s.lockPeriodId].apy;
            pending = (pending * scale) / 5;
        }

        totalClassicStaked -= s.amount;
        s.amount = 0; // Prevent re-unstaking
        s.rewardDebt = 0;

        blxToken.safeTransfer(msg.sender, amountToReturn);
        if (pending > 0) {
            mintRewards(msg.sender, pending);
        }

        emit ClassicUnstaked(msg.sender, amountToReturn, pending, penalty);
    }

    // --- Liquid Staking Functions ---

    /**
     * @dev Deposit BLX to receive liquid stBLX tokens. The exchange rate starts at 1:1,
     * and grows over time as virtual validator yield accumulates.
     */
    function stakeLiquid(uint256 _blxAmount) external nonReentrant {
        require(_blxAmount > 0, "Amount must be greater than 0");
        
        updateLiquidPool();

        uint256 totalstSupply = stBlxToken.totalSupply();
        uint256 stBlxToMint;

        if (totalstSupply == 0 || totalLiquidStakedBLX == 0) {
            stBlxToMint = _blxAmount;
        } else {
            stBlxToMint = (_blxAmount * totalstSupply) / totalLiquidStakedBLX;
        }

        blxToken.safeTransferFrom(msg.sender, address(this), _blxAmount);
        totalLiquidStakedBLX += _blxAmount;

        stBlxToken.mint(msg.sender, stBlxToMint);

        emit LiquidStaked(msg.sender, _blxAmount, stBlxToMint);
    }

    /**
     * @dev Redemeer burns stBLX and receives the deposited BLX plus compounding staking rewards.
     */
    function unstakeLiquid(uint256 _stBlxAmount) external nonReentrant {
        require(_stBlxAmount > 0, "Amount must be greater than 0");
        require(stBlxToken.balanceOf(msg.sender) >= _stBlxAmount, "Insufficient stBLX balance");

        updateLiquidPool();

        uint256 totalstSupply = stBlxToken.totalSupply();
        uint256 blxToReturn = (_stBlxAmount * totalLiquidStakedBLX) / totalstSupply;

        if (blxToReturn > totalLiquidStakedBLX) {
            blxToReturn = totalLiquidStakedBLX;
        }

        totalLiquidStakedBLX -= blxToReturn;
        stBlxToken.burnFrom(msg.sender, _stBlxAmount);

        blxToken.safeTransfer(msg.sender, blxToReturn);

        emit LiquidUnstaked(msg.sender, _stBlxAmount, blxToReturn);
    }

    // --- Yield Operations ---

    /**
     * @dev Accrues classic rewards based on the reward rate and time elapsed.
     */
    function updatePool() public {
        if (block.timestamp <= lastRewardTimestamp) {
            return;
        }

        if (totalClassicStaked == 0) {
            lastRewardTimestamp = block.timestamp;
            return;
        }

        uint256 multiplier = block.timestamp - lastRewardTimestamp;
        uint256 reward = multiplier * rewardRatePerSecond;

        accRewardPerShare += (reward * 1e12) / totalClassicStaked;
        lastRewardTimestamp = block.timestamp;
    }

    /**
     * @dev Accumulates staking pool yields dynamically based on liquidStakingAPY.
     * Mints fresh BLX to cover the accrued rewards, inflating the backing reserves.
     */
    function updateLiquidPool() public {
        if (block.timestamp <= lastLiquidRewardTimestamp) {
            return;
        }

        if (totalLiquidStakedBLX == 0) {
            lastLiquidRewardTimestamp = block.timestamp;
            return;
        }

        uint256 elapsed = block.timestamp - lastLiquidRewardTimestamp;
        // Formula: yield = totalStaked * APY * elapsed / 365 days
        uint256 yield = (totalLiquidStakedBLX * liquidStakingAPY * elapsed) / (100 * 365 days);

        if (yield > 0) {
            totalLiquidStakedBLX += yield;
            // Inflate reserves via minting new rewards to the pool contract
            try blxToken.mint(address(this), yield) {} catch {}
        }

        lastLiquidRewardTimestamp = block.timestamp;
    }

    /**
     * @dev Disburses rewards by requesting a mint from the token contract, with safety transfer fallbacks.
     */
    function mintRewards(address _to, uint256 _amount) internal {
        try blxToken.mint(_to, _amount) {} catch {
            uint256 contractBal = blxToken.balanceOf(address(this));
            uint256 toSend = _amount > contractBal ? contractBal : _amount;
            if (toSend > 0) {
                blxToken.safeTransfer(_to, toSend);
            }
        }
    }

    /**
     * @dev Gets the current exchange rate: how much BLX is 1 stBLX worth? (Scaled to 1e18)
     */
    function getstBLXExchangeRate() public view returns (uint256) {
        uint256 totalstSupply = stBlxToken.totalSupply();
        if (totalstSupply == 0 || totalLiquidStakedBLX == 0) {
            return 1e18; // 1:1
        }
        
        // Add pending virtual rewards for real-time rates
        uint256 elapsed = block.timestamp - lastLiquidRewardTimestamp;
        uint256 virtualTotalBLX = totalLiquidStakedBLX + 
            ((totalLiquidStakedBLX * liquidStakingAPY * elapsed) / (100 * 365 days));

        return (virtualTotalBLX * 1e18) / totalstSupply;
    }

    /**
     * @dev View function to get exact pending classic staking rewards for UI display.
     */
    function getPendingClassicRewards(address _user) external view returns (uint256) {
        uint256 tempAccRewardPerShare = accRewardPerShare;
        if (block.timestamp > lastRewardTimestamp && totalClassicStaked > 0) {
            uint256 multiplier = block.timestamp - lastRewardTimestamp;
            uint256 reward = multiplier * rewardRatePerSecond;
            tempAccRewardPerShare += (reward * 1e12) / totalClassicStaked;
        }

        uint256 pendingTotal = 0;
        Stake[] memory stakes = userStakes[_user];
        for (uint256 i = 0; i < stakes.length; i++) {
            Stake memory s = stakes[i];
            if (s.amount > 0) {
                uint256 shareReward = (s.amount * tempAccRewardPerShare) / 1e12;
                uint256 pending = shareReward - s.rewardDebt;
                uint256 scale = lockPeriods[s.lockPeriodId].apy;
                pending = (pending * scale) / 5;
                pendingTotal += pending;
            }
        }
        return pendingTotal;
    }

    function getUserStakesCount(address _user) external view returns (uint256) {
        return userStakes[_user].length;
    }

    // --- Admin Functions ---

    function setEarlyExitPenalty(uint256 _bps) external onlyOwner {
        require(_bps <= 3000, "Staking: Penalty limit 30%"); // Max 30% penalty
        emit EarlyExitPenaltyUpdated(earlyExitPenaltyBps, _bps);
        earlyExitPenaltyBps = _bps;
    }

    function setRewardRate(uint256 _newRate) external onlyOwner {
        updatePool();
        rewardRatePerSecond = _newRate;
    }

    function setLiquidStakingAPY(uint256 _newAPY) external onlyOwner {
        updateLiquidPool();
        liquidStakingAPY = _newAPY;
    }
}
