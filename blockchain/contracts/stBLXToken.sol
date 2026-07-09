// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title stBLXToken
 * @dev Liquid Staked Blume Token (stBLX). Minted and burned exclusively by the
 * BlumeStaking manager when users stake and unstake BLX.
 */
contract stBLXToken is ERC20, ERC20Burnable, Ownable {
    constructor() ERC20("Liquid Staked Blume", "stBLX") Ownable(msg.sender) {}

    /**
     * @dev Mint new stBLX, restricted to the owner (the Staking contract).
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @dev Burn stBLX, restricted to the owner (the Staking contract).
     */
    function burnFrom(address account, uint256 amount) public override onlyOwner {
        _burn(account, amount);
    }
}
