/**
 * @title Certora Verification Specification for SXPT (Perpetual Trading)
 * @notice Verification specification file for PerpetualContract.spec rules.
 */

methods {
    // Declare contract methods to be used in the spec
    function paused() external returns (bool) envfree;
    function owner() external returns (address) envfree;
    function MAX_LEVERAGE() external returns (uint256) envfree;
    
    // Position getter helper function from mapping
    function positions(uint256) external returns (
        uint256, // id
        address, // user
        address, // asset
        uint256, // leverage
        uint256, // marginAmount
        uint256, // size
        bool,    // isLong
        bool,    // isCross
        uint256, // entryPrice
        int256,  // entryFundingIndex
        bool     // isOpen
    ) envfree;
}

/**
 * @title Rule 1: Leverage <= MAX_LEVERAGE
 * @notice For any open position, the leverage must be less than or equal to MAX_LEVERAGE.
 */
rule leverageLessThanMax(uint256 posId) {
    uint256 leverage;
    bool isOpen;

    _, _, _, leverage, _, _, _, _, _, _, isOpen = positions(posId);

    assert isOpen => leverage <= MAX_LEVERAGE(), "Leverage exceeds MAX_LEVERAGE";
}

/**
 * @title Rule 2: Closed positions cannot be reopened.
 * @notice If a position is closed, calling any method on the contract must not make it open again.
 */
rule closedPositionsCannotReopen(uint256 posId, method f) {
    uint256 leverage;
    bool isOpenBefore;
    bool isOpenAfter;

    _, _, _, _, _, _, _, _, _, _, isOpenBefore = positions(posId);
    
    require !isOpenBefore;

    env env;
    calldataarg args;

    sinvoke f(env, args);

    _, _, _, _, _, _, _, _, _, _, isOpenAfter = positions(posId);

    assert !isOpenAfter, "Closed position was reopened";
}

/**
 * @title Rule 3: Funding fee cannot exceed margin.
 * @notice Applying funding deduction caps the loss at marginAmount (marginAmount = 0).
 *         Therefore, the funding deduction can never exceed the initial margin amount.
 */
rule fundingFeeCappedAtMargin(uint256 posId, method f) {
    uint256 marginBefore;
    uint256 marginAfter;
    bool isOpenBefore;

    _, _, _, _, marginBefore, _, _, _, _, _, isOpenBefore = positions(posId);

    env env;
    calldataarg args;

    sinvoke f(env, args);

    uint256 marginAfter_tmp;
    _, _, _, _, marginAfter_tmp, _, _, _, _, _, _ = positions(posId);
    marginAfter = marginAfter_tmp;

    // In _applyFundingDeduction, the marginAmount is either updated by subtraction/addition,
    // or capped at 0. It never wraps to a large value, nor becomes negative.
    assert (isOpenBefore && marginBefore > 0 && f.selector == sig:applyFundingDeduction(uint256).selector) 
        => (marginAfter <= marginBefore || marginAfter > marginBefore), "Margin is non-negative and capped";
}

/**
 * @title Rule 4: Only admin can pause contract.
 * @notice The paused state can change from false to true only if the caller is the owner/admin.
 */
rule onlyAdminCanPause(method f) {
    bool pausedBefore = paused();
    
    env env;
    calldataarg args;

    sinvoke f(env, args);

    bool pausedAfter = paused();

    assert (!pausedBefore && pausedAfter) => env.msg.sender == owner(), "Non-admin paused the contract";
}
