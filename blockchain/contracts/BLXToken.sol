// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BLXToken
 * @dev Standard ERC-20 token for Blume Token (BLX) with capped max supply, burning,
 * access control minter configurations, and anti-whale/anti-bot transfer limits.
 */
contract BLXToken is ERC20, ERC20Burnable, Ownable {
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18; // 1 Billion BLX Cap

    // Anti-Whale Parameters
    uint256 public maxTxAmount = 10_000_000 * 10**18;    // 1% of Max Supply (10M BLX)
    uint256 public maxWalletAmount = 20_000_000 * 10**18; // 2% of Max Supply (20M BLX)
    
    mapping(address => bool) public isExcludedFromLimits;
    mapping(address => bool) public isMinter;

    event MinterAdded(address indexed account);
    event MinterRemoved(address indexed account);
    event ExcludedFromLimits(address indexed account, bool isExcluded);
    event LimitsUpdated(uint256 newMaxTx, uint256 newMaxWallet);

    modifier onlyMinter() {
        require(isMinter[msg.sender] || msg.sender == owner(), "BLX: Caller is not a minter");
        _;
    }

    constructor() ERC20("Blume Token", "BLX") Ownable(msg.sender) {
        // Exclude owner, deployer, and the contract itself from transfer limits
        isExcludedFromLimits[msg.sender] = true;
        isExcludedFromLimits[address(this)] = true;
        isMinter[msg.sender] = true;

        // Mint initial supply of 500 million to deployer for pools and marketing
        _mint(msg.sender, 500_000_000 * 10**18);
    }

    /**
     * @dev Mint new BLX tokens. Restricted to owner and authorized contracts (Staking, Vault).
     */
    function mint(address to, uint256 amount) external onlyMinter {
        require(totalSupply() + amount <= MAX_SUPPLY, "BLX: Supply Cap exceeded");
        _mint(to, amount);
    }

    /**
     * @dev Exclude/Include addresses from anti-whale wallet and transaction limits (e.g. pools).
     */
    function setExcludeFromLimits(address account, bool exclude) external onlyOwner {
        isExcludedFromLimits[account] = exclude;
        emit ExcludedFromLimits(account, exclude);
    }

    /**
     * @dev Set anti-whale limit values.
     */
    function updateLimits(uint256 _maxTx, uint256 _maxWallet) external onlyOwner {
        require(_maxTx >= 1_000_000 * 10**18, "BLX: Limit too low");
        require(_maxWallet >= 2_000_000 * 10**18, "BLX: Wallet limit too low");
        maxTxAmount = _maxTx;
        maxWalletAmount = _maxWallet;
        emit LimitsUpdated(_maxTx, _maxWallet);
    }

    /**
     * @dev Hook into ERC-20 transfers to validate anti-whale and anti-bot rules.
     */
    function _update(address from, address to, uint256 value) internal override {
        // Validate limits only on standard user transfers (excludes minting and burning)
        if (from != address(0) && to != address(0)) {
            if (!isExcludedFromLimits[from] && !isExcludedFromLimits[to]) {
                require(value <= maxTxAmount, "BLX: Transfer amount exceeds maxTxAmount limit");
                require(balanceOf(to) + value <= maxWalletAmount, "BLX: Target wallet balance exceeds maxWalletLimit");
            }
        }
        super._update(from, to, value);
    }

    // --- Access Roles ---

    function addMinter(address account) external onlyOwner {
        isMinter[account] = true;
        isExcludedFromLimits[account] = true; // Pools/minters should also be excluded from limits
        emit MinterAdded(account);
    }

    function removeMinter(address account) external onlyOwner {
        isMinter[account] = false;
        emit MinterRemoved(account);
    }
}
