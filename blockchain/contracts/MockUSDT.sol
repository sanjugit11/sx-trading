// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDT
 * @dev Mock Tether USD token with 6 decimal precision. Features a faucet mint
 * to allow users to acquire test USDT directly inside the dashboard.
 */
contract MockUSDT is ERC20, Ownable {
    constructor() ERC20("Mock Tether USD", "USDT") Ownable(msg.sender) {
        // Mint 1 billion USDT to the deployer
        _mint(msg.sender, 1_000_000_000 * 10**6);
    }

    /**
     * @dev Overrides decimals to return 6, mimicking genuine USDT.
     */
    function decimals() public view virtual override returns (uint8) {
        return 6;
    }

    /**
     * @dev Standard mint faucet for easy test token acquisition.
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
