// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ISXLS {
    function openLeveragedSpot(
        address targetAsset,
        uint256 collateralAmount,
        uint256 leverage,
        bool isLimit,
        uint256 triggerPrice
    ) external;
}

contract SXHOP is Ownable {
    using SafeERC20 for IERC20;

    enum OrderType { HOBL, HOPL, HOTL }
    enum OrderStatus { Pending, Executed, Cancelled }

    struct HiddenOrder {
        uint256 id;
        bytes32 commitment;
        OrderStatus status;
        address creator;
        uint256 timestamp;
    }

    ISXLS public immutable sxls;
    IERC20 public immutable usdt;

    uint256 public orderCounter;
    mapping(uint256 => HiddenOrder) public orders;

    event HiddenOrderPlaced(uint256 indexed orderId, bytes32 orderCommitment);
    event HiddenOrderExecuted(uint256 indexed orderId, address executor);
    event HiddenOrderCancelled(uint256 indexed orderId);

    constructor(address _sxls, address _usdt) Ownable(msg.sender) {
        sxls = ISXLS(_sxls);
        usdt = IERC20(_usdt);
    }

    function placeHiddenOrder(bytes32 orderCommitment, bytes calldata proof) external {
        // Mock ZK proof verification: requires proof to be non-empty
        require(proof.length > 0, "SXHOP: invalid ZK proof");
        require(orderCommitment != bytes32(0), "SXHOP: commitment cannot be empty");

        orderCounter++;
        uint256 orderId = orderCounter;

        orders[orderId] = HiddenOrder({
            id: orderId,
            commitment: orderCommitment,
            status: OrderStatus.Pending,
            creator: msg.sender,
            timestamp: block.timestamp
        });

        emit HiddenOrderPlaced(orderId, orderCommitment);
    }

    function executeHiddenOrder(
        uint256 orderId,
        bytes calldata executionDetails,
        bytes calldata proof
    ) external {
        HiddenOrder storage order = orders[orderId];
        require(order.status == OrderStatus.Pending, "SXHOP: order not pending");
        require(proof.length > 0, "SXHOP: invalid ZK execution proof");

        // Decode executionDetails:
        // user, targetAsset, collateralAmount, leverage, orderType, price, salt
        (
            address user,
            address targetAsset,
            uint256 collateralAmount,
            uint256 leverage,
            uint8 orderTypeVal,
            uint256 price,
            uint256 salt
        ) = abi.decode(executionDetails, (address, address, uint256, uint256, uint8, uint256, uint256));

        // Re-compute commitment to verify integrity
        bytes32 calculatedCommitment = keccak256(
            abi.encode(user, targetAsset, collateralAmount, leverage, orderTypeVal, price, salt)
        );
        require(calculatedCommitment == order.commitment, "SXHOP: commitment mismatch");

        // Set status to Executed
        order.status = OrderStatus.Executed;

        // Pull funds from user (the user must have approved this SXHOP contract to spend USDT)
        // Transfer USDT to this contract first, then approve SXLS
        usdt.safeTransferFrom(user, address(this), collateralAmount);
        usdt.approve(address(sxls), collateralAmount);

        // Execute the spot order on the SXLS contract
        sxls.openLeveragedSpot(targetAsset, collateralAmount, leverage, false, 0);

        emit HiddenOrderExecuted(orderId, msg.sender);
    }

    function cancelHiddenOrder(uint256 orderId) external {
        HiddenOrder storage order = orders[orderId];
        require(order.status == OrderStatus.Pending, "SXHOP: order not pending");
        require(order.creator == msg.sender, "SXHOP: unauthorized");

        order.status = OrderStatus.Cancelled;
        emit HiddenOrderCancelled(orderId);
    }

    function getOrderStatus(uint256 orderId) external view returns (uint8) {
        return uint8(orders[orderId].status);
    }
}
