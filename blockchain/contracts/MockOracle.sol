// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockOracle
 * @dev Mock implementation of Chainlink's AggregatorV3Interface.
 * Supplies price queries and allows owner-driven updates for local/testnet sandboxes.
 */
contract MockOracle {
    int256 private price;
    uint8 private decimalPlaces;
    string public description;

    constructor(int256 _initialPrice, uint8 _decimals, string memory _desc) {
        price = _initialPrice;
        decimalPlaces = _decimals;
        description = _desc;
    }

    function decimals() external view returns (uint8) {
        return decimalPlaces;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (1, price, block.timestamp, block.timestamp, 1);
    }

    /**
     * @dev Update the oracle feed price, restricted to the mock deployment operator.
     */
    function setPrice(int256 _newPrice) external {
        price = _newPrice;
    }
}
