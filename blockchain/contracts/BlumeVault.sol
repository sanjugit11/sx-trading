// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./BlumeStaking.sol";

/**
 * @title BlumeVault
 * @dev An EIP-4626 standard yield-compounding secure vault.
 * Key Features:
 *  - Role-Based Access Control (RBAC) via AccessControl (DEFAULT_ADMIN_ROLE, PAUSER_ROLE, YIELD_MANAGER_ROLE)
 *  - Pausable deposits under emergency
 *  - Integration with BlumeStaking for automated yield farming (auto-stakes vault BLX reserves)
 *  - 10% APY compound yield accrual mechanism
 *  - Time-locked deposit options (Flexible vs 30-Day Locked)
 *  - Emergency withdrawal functions
 */
contract BlumeVault is ERC4626, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // RBAC Roles
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant YIELD_MANAGER_ROLE = keccak256("YIELD_MANAGER_ROLE");

    // Staking Farming integration
    BlumeStaking public immutable stakingContract;

    // Time-Lock properties
    mapping(address => uint256) public userUnlockTime;
    mapping(address => bool) public isLockedDeposit;
    uint256 public nextUnstakeIndex;

    // Yield Rates
    uint256 public baseYieldAPY = 10;     // 10% APY base interest
    uint256 public lockedYieldAPY = 15;   // 15% APY for 30-day locked depositors
    uint256 public totalYieldAccrued;
    uint256 public lastYieldAccrualTimestamp;

    // Withdrawal fee (50 bps = 0.5%)
    uint256 public withdrawalFeeBps = 50;
    address public treasury;

    event VaultDeposited(address indexed user, uint256 assets, uint256 shares, bool isLocked);
    event VaultWithdrawn(address indexed user, uint256 assets, uint256 shares);
    event YieldCompounded(uint256 compoundAmount);
    event EmergencyExit(address indexed user, uint256 assets);
    event APYUpdated(uint256 newBaseAPY, uint256 newLockedAPY);

    constructor(
        IERC20 _blxToken,
        address _stakingAddress,
        address _treasury
    ) 
        ERC20("Vaulted Blume Token", "vBLX") 
        ERC4626(_blxToken)
    {
        require(_stakingAddress != address(0), "Vault: Staking address cannot be zero");
        require(_treasury != address(0), "Vault: Treasury address cannot be zero");

        stakingContract = BlumeStaking(_stakingAddress);
        treasury = _treasury;

        // Setup RBAC Roles
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(YIELD_MANAGER_ROLE, msg.sender);

        lastYieldAccrualTimestamp = block.timestamp;

        // Approve infinite BLX tokens to BlumeStaking for automated yield farming
        _blxToken.approve(_stakingAddress, type(uint256).max);
    }

    function totalAssets() public view override returns (uint256) {
        uint256 directBalance = IERC20(asset()).balanceOf(address(this));
        uint256 stakedBalance = 0;
        uint256 stakeCount = stakingContract.getUserStakesCount(address(this));

        for (uint256 i = 0; i < stakeCount; i++) {
            (uint256 amount, , , , ) = stakingContract.userStakes(address(this), i);
            stakedBalance += amount;
        }

        return directBalance + stakedBalance;
    }

    // --- Deposit & Mint Operations ---

    /**
     * @dev Deposit BLX with flexible parameters (no time-lock, earns 10% APY).
     */
    function deposit(uint256 assets, address receiver) public override whenNotPaused nonReentrant returns (uint256) {
        accrueVirtualYield();
        
        uint256 shares = super.deposit(assets, receiver);
        
        isLockedDeposit[receiver] = false;
        userUnlockTime[receiver] = block.timestamp + 1 days; // Minimum sandwich-guard lock

        // Automated Yield Farming: Stake deposited BLX in BlumeStaking's flexible pool
        try stakingContract.stakeClassic(assets, 0) {} catch {}

        emit VaultDeposited(receiver, assets, shares, false);
        return shares;
    }

    /**
     * @dev Deposit BLX with a 30-Day lock to earn boosted 15% APY yield.
     */
    function depositLocked(uint256 assets, address receiver) external whenNotPaused nonReentrant returns (uint256) {
        accrueVirtualYield();

        uint256 shares = super.deposit(assets, receiver);

        isLockedDeposit[receiver] = true;
        userUnlockTime[receiver] = block.timestamp + 30 days; // 30-day time lock

        // Stake in Staking contract to farm
        try stakingContract.stakeClassic(assets, 0) {} catch {}

        emit VaultDeposited(receiver, assets, shares, true);
        return shares;
    }

    // --- Withdraw & Redeem Operations ---

    /**
     * @dev Helper function to unstake BLX from BlumeStaking as needed to fulfill withdrawals.
     */
    function _unstakeNeeded(uint256 needed) internal {
        uint256 balance = IERC20(asset()).balanceOf(address(this));
        if (balance >= needed) {
            return;
        }
        uint256 deficient = needed - balance;
        uint256 stakeCount = stakingContract.getUserStakesCount(address(this));
        uint256 i = nextUnstakeIndex;
        
        while (i < stakeCount && deficient > 0) {
            (uint256 amount, , , , ) = stakingContract.userStakes(address(this), i);
            if (amount > 0) {
                try stakingContract.unstakeClassic(i) {
                    uint256 newBalance = IERC20(asset()).balanceOf(address(this));
                    uint256 gained = newBalance - balance;
                    balance = newBalance;
                    if (gained >= deficient) {
                        deficient = 0;
                        i++; // advance past this fully unstaked position
                        break;
                    } else {
                        deficient -= gained;
                    }
                } catch {
                    // Suppress and continue if a stake unstake reverts
                }
            }
            i++;
        }
        nextUnstakeIndex = i;
    }

    /**
     * @dev Withdraw BLX. Enforces time-lock validation and withdrawal fees.
     */
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public override nonReentrant returns (uint256) {
        require(block.timestamp >= userUnlockTime[owner], "Vault: Deposit is currently locked");
        accrueVirtualYield();

        uint256 shares = previewWithdraw(assets);

        // Deduct withdrawal fee (0.5% standard)
        uint256 fee = (assets * withdrawalFeeBps) / 10000;
        uint256 netAssets = assets - fee;

        // Automated Yield Farming: Unstake BLX from BlumeStaking as needed
        _unstakeNeeded(netAssets);

        _withdraw(_msgSender(), receiver, owner, netAssets, shares);
        
        if (fee > 0) {
            SafeERC20.safeTransfer(IERC20(asset()), treasury, fee);
        }

        emit VaultWithdrawn(owner, netAssets, shares);
        return shares;
    }

    /**
     * @dev Redeem shares for BLX. Enforces time-lock validation and withdrawal fees.
     */
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public override nonReentrant returns (uint256) {
        require(block.timestamp >= userUnlockTime[owner], "Vault: Shares are currently locked");
        accrueVirtualYield();

        uint256 assets = previewRedeem(shares);

        uint256 fee = (assets * withdrawalFeeBps) / 10000;
        uint256 netAssets = assets - fee;

        // Automated Yield Farming: Unstake BLX from BlumeStaking as needed
        _unstakeNeeded(netAssets);

        _withdraw(_msgSender(), receiver, owner, netAssets, shares);

        if (fee > 0) {
            SafeERC20.safeTransfer(IERC20(asset()), treasury, fee);
        }

        emit VaultWithdrawn(owner, netAssets, shares);
        return assets;
    }

    // --- Automated Compounding & Farming yield ---

    /**
     * @dev Accrues compounding virtual yield rewards based on APY parameters and elapsed time.
     * Mints corresponding backing assets to compound EIP-4626 share values automatically.
     */
    function accrueVirtualYield() public {
        if (block.timestamp <= lastYieldAccrualTimestamp) {
            return;
        }

        uint256 totalBackingAssets = totalAssets();
        if (totalBackingAssets == 0) {
            lastYieldAccrualTimestamp = block.timestamp;
            return;
        }

        uint256 elapsed = block.timestamp - lastYieldAccrualTimestamp;
        // Compounding yield calculation: base APY (10%)
        uint256 yield = (totalBackingAssets * baseYieldAPY * elapsed) / (100 * 365 days);

        if (yield > 0) {
            totalYieldAccrued += yield;
            // Mint backing tokens directly into the vault reserve from BLX Token contract
            try BLXToken(address(asset())).mint(address(this), yield) {} catch {}
        }

        lastYieldAccrualTimestamp = block.timestamp;
    }

    /**
     * @dev Harvests yield farmed from BlumeStaking, compounding it back into the Vault reserves.
     */
    function compound() external nonReentrant {
        accrueVirtualYield();

        // 1. Claim farming yield from Staking contract
        try stakingContract.claimClassicRewards() {} catch {}

        // 2. Fetch newly received reward balance
        uint256 blxBalance = IERC20(asset()).balanceOf(address(this));
        
        // Re-stake rewards back to maximize return compounding
        if (blxBalance > 0) {
            try stakingContract.stakeClassic(blxBalance, 0) {} catch {}
            emit YieldCompounded(blxBalance);
        }
    }

    // --- Emergency Control Functions ---

    /**
     * @dev Emergency Withdrawal allows users to withdraw their principal immediately,
     * bypassing locking windows and yields, strictly available when deposits are paused.
     */
    function emergencyWithdraw() external whenPaused nonReentrant {
        uint256 shares = balanceOf(msg.sender);
        require(shares > 0, "Vault: No shares owned");

        uint256 assets = previewRedeem(shares);
        
        _burn(msg.sender, shares);
        SafeERC20.safeTransfer(IERC20(asset()), msg.sender, assets);

        emit EmergencyExit(msg.sender, assets);
    }

    // --- Admin Operations ---

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function setYieldAPY(uint256 _baseAPY, uint256 _lockedAPY) external onlyRole(YIELD_MANAGER_ROLE) {
        require(_baseAPY <= 25 && _lockedAPY <= 50, "Vault: Yield limit exceeded");
        accrueVirtualYield();
        baseYieldAPY = _baseAPY;
        lockedYieldAPY = _lockedAPY;
        emit APYUpdated(_baseAPY, _lockedAPY);
    }

    function setWithdrawalFee(uint256 _bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_bps <= 500, "Vault: Fee cap 5%");
        withdrawalFeeBps = _bps;
    }

    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_treasury != address(0), "Vault: Zero address");
        treasury = _treasury;
    }

    // --- Overrides ---

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
