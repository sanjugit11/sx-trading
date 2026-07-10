// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";

contract MockOracle is Ownable {
    mapping(address => uint256) private prices;

    event PriceUpdated(address indexed asset, uint256 price);

    constructor() Ownable(msg.sender) {}

    function setPrice(address asset, uint256 price) external onlyOwner {
        prices[asset] = price;
        emit PriceUpdated(asset, price);
    }

    function getPrice(address asset) external view returns (uint256) {
        uint256 price = prices[asset];
        require(price > 0, "Oracle: price not set");
        return price;
    }
}
