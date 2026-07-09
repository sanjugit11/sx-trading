# Blockchain Development Roadmap

This document serves as the complete, structured development roadmap for the Blume Token (BLX) Decentralized DeFi Ecosystem. It is designed to be directly usable by the blockchain engineering team to implement, test, deploy, and verify the system's smart contracts.

---

## Phase 1 – Smart Contract Development

The Blume Token ecosystem comprises seven smart contracts. Below is the detailed specification for each contract.

---

### 1. Contract: BLXToken

#### Purpose
`BLXToken` is the core ERC-20 utility token for the Blume ecosystem. It features a hard-capped maximum supply of 1 Billion tokens, burnable capabilities, access control minter configuration, and anti-whale/anti-bot transfer limits to protect liquidity and prevent market manipulation.

#### Functional Requirements
- **Standard ERC-20 compliance** (transfer, balance checks, allowance, approve, transferFrom).
- **Supply Cap Enforcement**: Enforce a strict maximum supply limit of 1 Billion tokens.
- **ERC20Burnable**: Allow token holders to burn their tokens.
- **Minter Registry**: Allow the owner to authorize specific contract addresses (e.g., Staking, Vault) to mint new tokens.
- **Anti-Whale Transfer Limits**: Enforce maximum transaction amount limits (default: 1% of max supply) and maximum wallet holding limits (default: 2% of max supply) on standard users.
- **Exclusion Management**: Enable the owner to exempt specific addresses (such as staking pools, liquidity pools, and the vault) from the transfer limits.
- **Dynamic Limit Updates**: Allow the owner to dynamically update the limit thresholds above minimum safety limits.

#### State Variables
| Variable Name | Type | Value / Details |
| --- | --- | --- |
| `MAX_SUPPLY` | `uint256` | `1_000_000_000 * 10**18` (1 Billion BLX constant) |
| `maxTxAmount` | `uint256` | `10_000_000 * 10**18` (1% of MAX_SUPPLY, public) |
| `maxWalletAmount` | `uint256` | `20_000_000 * 10**18` (2% of MAX_SUPPLY, public) |

#### Structs
*None defined.*

#### Enums
*None defined.*

#### Mappings
| Mapping Key | Mapping Value | Description |
| --- | --- | --- |
| `isExcludedFromLimits` | `address => bool` | Tracks whether an address is exempt from anti-whale limits. |
| `isMinter` | `address => bool` | Tracks whether an address is authorized to mint BLX. |

#### Events
- `event MinterAdded(address indexed account)`
- `event MinterRemoved(address indexed account)`
- `event ExcludedFromLimits(address indexed account, bool isExcluded)`
- `event LimitsUpdated(uint256 newMaxTx, uint256 newMaxWallet)`

#### Errors (Custom Messages)
- `"BLX: Caller is not a minter"` (Used in `onlyMinter` modifier)
- `"BLX: Supply Cap exceeded"` (Used in `mint` function)
- `"BLX: Limit too low"` (Used in `updateLimits` function)
- `"BLX: Wallet limit too low"` (Used in `updateLimits` function)
- `"BLX: Transfer amount exceeds maxTxAmount limit"` (Used in `_update` check)
- `"BLX: Target wallet balance exceeds maxWalletLimit"` (Used in `_update` check)

#### Modifiers
- `onlyMinter()`: Verifies that the caller is either registered as a minter or is the contract owner.

#### Smart Contract Functions

##### 1. Constructor
- **Visibility**: `public`
- **Parameters**: None
- **Returns**: None
- **Description**: Initializes the token name ("Blume Token"), symbol ("BLX"), and designates `msg.sender` as the initial owner. Excludes the deployer and the contract address itself from limits, grants the deployer minter permissions, and mints an initial supply of 500 million tokens (`500_000_000 * 10**18`) to the deployer.
- **Access Control**: None
- **Events Emitted**: `Transfer` (mint event)
- **Validation Rules**: None

##### 2. mint
- **Visibility**: `external`
- **Parameters**: 
  - `to` (`address`): Recipient wallet address.
  - `amount` (`uint256`): Number of tokens to mint (with 18 decimals).
- **Returns**: None
- **Description**: Mints new BLX tokens to the designated recipient address.
- **Access Control**: `onlyMinter`
- **Events Emitted**: `Transfer`
- **Validation Rules**: Total supply after minting must not exceed `MAX_SUPPLY`.

##### 3. setExcludeFromLimits
- **Visibility**: `external`
- **Parameters**:
  - `account` (`address`): Address to exclude/include.
  - `exclude` (`bool`): Active state of exclusion.
- **Returns**: None
- **Description**: Excludes or includes a target address from the anti-whale and anti-bot wallet limits.
- **Access Control**: `onlyOwner`
- **Events Emitted**: `ExcludedFromLimits`
- **Validation Rules**: None

##### 4. updateLimits
- **Visibility**: `external`
- **Parameters**:
  - `_maxTx` (`uint256`): New maximum transfer amount limit.
  - `_maxWallet` (`uint256`): New maximum wallet balance limit.
- **Returns**: None
- **Description**: Sets new anti-whale limit values.
- **Access Control**: `onlyOwner`
- **Events Emitted**: `LimitsUpdated`
- **Validation Rules**: `_maxTx` must be $\ge$ `1,000,000 * 10**18` and `_maxWallet` must be $\ge$ `2,000,000 * 10**18`.

##### 5. _update (Internal Hook)
- **Visibility**: `internal` `override`
- **Parameters**:
  - `from` (`address`): Sender address.
  - `to` (`address`): Recipient address.
  - `value` (`uint256`): Transfer amount.
- **Returns**: None
- **Description**: Overrides the internal ERC-20 transfer hook to validate anti-whale and anti-bot conditions.
- **Access Control**: None
- **Events Emitted**: `Transfer` (via `super._update`)
- **Validation Rules**: Only applies to standard user transfers (excludes minting and burning where `from` or `to` is `address(0)`). If neither `from` nor `to` is excluded, it asserts that `value` is $\le$ `maxTxAmount` and recipient's final balance `balanceOf(to) + value` is $\le$ `maxWalletAmount`.

##### 6. addMinter
- **Visibility**: `external`
- **Parameters**:
  - `account` (`address`): Address to authorize.
- **Returns**: None
- **Description**: Grants an account minter privileges and automatically excludes them from limits.
- **Access Control**: `onlyOwner`
- **Events Emitted**: `MinterAdded`
- **Validation Rules**: None

##### 7. removeMinter
- **Visibility**: `external`
- **Parameters**:
  - `account` (`address`): Address to revoke.
- **Returns**: None
- **Description**: Revokes minter status from an account.
- **Access Control**: `onlyOwner`
- **Events Emitted**: `MinterRemoved`
- **Validation Rules**: None

#### Business Logic
1. **Transfer Flow**: Every transfer invokes `_update`.
2. **Limit Assessment**: The contract checks if the transfer is a standard user transfer (non-mint/burn) and if the participants are non-exempt.
3. **Rejection**: If a user attempts to transfer more than 10M BLX or cause the recipient's wallet to hold more than 20M BLX, it reverts the transaction immediately.
4. **Minting & Cap**: Minter contracts request minting via `mint()`. The supply is checked against 1 Billion.

#### Dependencies
- OpenZeppelin `ERC20`
- OpenZeppelin `ERC20Burnable`
- OpenZeppelin `Ownable`

#### Security Requirements
- Minter capabilities restricted to trusted pools.
- Underflow/overflow protection via Solidity 0.8 default checked arithmetic.
- Strict bounds checks in `updateLimits` to prevent configuring zero or extremely low limit values.

---

### 2. Contract: stBLXToken

#### Purpose
`stBLXToken` represents Liquid Staked Blume (stBLX). It is minted to users when they stake BLX in the liquid pool and is burned when they redeem their liquid stake. The contract is designed to be owned and managed exclusively by the `BlumeStaking` contract.

#### Functional Requirements
- **Standard ERC-20 compliance** (transfer, balance checks, allowances).
- **ERC20Burnable**: Support token burning.
- **Staking Manager Exclusivity**: Restrict minting and burning entirely to the `BlumeStaking` manager contract.

#### State Variables
*None defined (inherits standard ERC20 properties).*

#### Structs
*None defined.*

#### Enums
*None defined.*

#### Mappings
*None defined (inherits standard ERC20 mappings).*

#### Events
*None defined (inherits standard ERC20 events).*

#### Errors
*None defined.*

#### Modifiers
- `onlyOwner` (inherits from OZ `Ownable` representing the Staking contract).

#### Smart Contract Functions

##### 1. Constructor
- **Visibility**: `public`
- **Parameters**: None
- **Returns**: None
- **Description**: Initializes the token name ("Liquid Staked Blume"), symbol ("stBLX"), and assigns ownership to `msg.sender`.
- **Access Control**: None
- **Events Emitted**: None

##### 2. mint
- **Visibility**: `external`
- **Parameters**:
  - `to` (`address`): Recipient wallet address.
  - `amount` (`uint256`): Number of tokens to mint.
- **Returns**: None
- **Description**: Mints new stBLX.
- **Access Control**: `onlyOwner` (the Staking contract)
- **Events Emitted**: `Transfer`

##### 3. burnFrom
- **Visibility**: `public` `override`
- **Parameters**:
  - `account` (`address`): Wallet address to burn tokens from.
  - `amount` (`uint256`): Amount of tokens to burn.
- **Returns**: None
- **Description**: Destroys stBLX tokens from a specified account.
- **Access Control**: `onlyOwner` (the Staking contract)
- **Events Emitted**: `Transfer`

#### Business Logic
This is a standard ERC-20 token wrapper where mint/burn access is locked to the owner. The staking contract handles all balance calculations and calls `mint` and `burnFrom` to synchronize user shares.

#### Dependencies
- OpenZeppelin `ERC20`
- OpenZeppelin `ERC20Burnable`
- OpenZeppelin `Ownable`

#### Security Requirements
- Strict ownership enforcement. Ownership must be transferred to the Staking contract immediately post-deployment.

---

### 3. Contract: BlumeStaking

#### Purpose
`BlumeStaking` is the core yield engine. It manages two main staking operations:
1. **Classic Staking**: Users lock BLX for various schedules (Flexible, 30 days, 90 days, 180 days) to earn reward multipliers. Early unstaking triggers a 15% penalty fee on the principal and forfeits pending rewards.
2. **Liquid Staking**: Users deposit BLX to mint liquid `stBLX` shares. Validator rewards compound dynamically, driving up the exchange rate of `stBLX` relative to BLX.

#### Functional Requirements
- **Classic Locking Staking**: Support user deposits with custom lock durations and APYs.
- **Dynamic Reward Accrual**: Distribute rewards based on elapsed time and an adjustable reward-per-second rate.
- **Early Withdrawal Penalties**: Enforce a penalty fee (default: 15%) on the principal and forfeit pending rewards if unstaking before lock maturity.
- **Liquid Staking Shares**: Calculate mintable `stBLX` amounts relative to the total liquid-staked pool reserves.
- **Dynamic Liquid APY Compounding**: Inflate backing reserves based on a configured APY via automated virtual minting.
- **Real-Time Exchange Rate Calculation**: Provide exchange rates for `stBLX` including pending virtual yields.

#### State Variables
| Variable Name | Type | Value / Details |
| --- | --- | --- |
| `blxToken` | `BLXToken` | Immutable instance of the BLX Token contract. |
| `stBlxToken` | `stBLXToken` | Immutable instance of the stBLX Token contract. |
| `lockPeriods` | `LockPeriod[]` | Array of configured lock periods and APYs. |
| `totalClassicStaked` | `uint256` | Total BLX currently locked in classic staking. |
| `accRewardPerShare` | `uint256` | Accumulated rewards per classic share (scaled to 1e12). |
| `lastRewardTimestamp` | `uint256` | Last time classic rewards were updated. |
| `rewardRatePerSecond` | `uint256` | Initial rewards distributed per second (`1e16` = 0.01 BLX). |
| `totalLiquidStakedBLX` | `uint256` | Total backing BLX in the liquid staking pool. |
| `liquidStakingAPY` | `uint256` | APY configured for liquid staking rewards (default: 12%). |
| `lastLiquidRewardTimestamp` | `uint256` | Last block timestamp liquid staking rewards were accrued. |
| `earlyExitPenaltyBps` | `uint256` | Penalty fee in basis points (default: 1500 bps = 15%). |

#### Structs
```solidity
struct Stake {
    uint256 amount;
    uint256 rewardDebt;
    uint256 lockTimestamp;
    uint256 unlockTimestamp;
    uint256 lockPeriodId;
}

struct LockPeriod {
    uint256 duration; // in seconds
    uint256 apy;      // base APY percentage (e.g. 10 = 10%)
}
```

#### Enums
*None defined.*

#### Mappings
| Mapping Key | Mapping Value | Description |
| --- | --- | --- |
| `userStakes` | `address => Stake[]` | Stores arrays of classic stakes for each wallet. |

#### Events
- `ClassicStaked(address indexed user, uint256 amount, uint256 lockPeriodId, uint256 unlockTimestamp)`
- `ClassicUnstaked(address indexed user, uint256 amount, uint256 rewardClaimed, uint256 penaltyDeducted)`
- `RewardClaimed(address indexed user, uint256 amount)`
- `LiquidStaked(address indexed user, uint256 blxAmount, uint256 stBlxAmount)`
- `LiquidUnstaked(address indexed user, uint256 stBlxAmount, uint256 blxAmount)`
- `EarlyExitPenaltyUpdated(uint256 oldPenalty, uint256 newPenalty)`

#### Errors (Custom Messages)
- `"Addresses cannot be zero"`
- `"Amount must be greater than 0"`
- `"Invalid lock period"`
- `"Stake index out of bounds"`
- `"Already unstaked"`
- `"Insufficient stBLX balance"`
- `"Staking: Penalty limit 30%"`

#### Modifiers
- `onlyOwner` (inherits from OZ `Ownable`)
- `nonReentrant` (inherits from OZ `ReentrancyGuard`)

#### Smart Contract Functions

##### 1. Constructor
- **Visibility**: `public`
- **Parameters**:
  - `_blxToken` (`address`): BLX token contract address.
  - `_stBlxToken` (`address`): stBLX token contract address.
- **Returns**: None
- **Description**: Initializes addresses, default lock schedules:
  - Flex: 0 days, 5% APY
  - 30-Day: 30 days, 10% APY
  - 90-Day: 90 days, 18% APY
  - 180-Day: 180 days, 28% APY
  Sets `lastRewardTimestamp` and `lastLiquidRewardTimestamp` to current `block.timestamp`.
- **Access Control**: None

##### 2. stakeClassic
- **Visibility**: `external`
- **Parameters**:
  - `_amount` (`uint256`): BLX amount to stake.
  - `_lockPeriodId` (`uint256`): ID of selected lock duration.
- **Returns**: None
- **Description**: Deposits BLX into a classic locked stake. Updates reward pools, pulls tokens, calculates unlock dates, and creates a `Stake` entry.
- **Access Control**: `nonReentrant`
- **Events Emitted**: `ClassicStaked`
- **Validation Rules**: `_amount` must be $> 0$; `_lockPeriodId` must be valid.

##### 3. claimClassicRewards
- **Visibility**: `public`
- **Parameters**: None
- **Returns**: None
- **Description**: Claims outstanding classic staking rewards across all of the caller's stakes. Scales reward payouts using the lock period APY multipliers relative to the flexible pool.
- **Access Control**: `nonReentrant`
- **Events Emitted**: `RewardClaimed`

##### 4. unstakeClassic
- **Visibility**: `external`
- **Parameters**:
  - `_stakeIndex` (`uint256`): Index of the stake in `userStakes[msg.sender]`.
- **Returns**: None
- **Description**: Withdraws staked principal. If the lock period has not expired, it deducts a 15% early withdrawal penalty from the principal, sends the penalty to the owner (treasury), and forfeits all pending rewards. If matured, it calculates and mints full rewards.
- **Access Control**: `nonReentrant`
- **Events Emitted**: `ClassicUnstaked`
- **Validation Rules**: Index must be within bounds; stake amount must be $> 0$ (not already unstaked).

##### 5. stakeLiquid
- **Visibility**: `external`
- **Parameters**:
  - `_blxAmount` (`uint256`): BLX amount to deposit.
- **Returns**: None
- **Description**: Deposits BLX and mints liquid stBLX tokens. The mint amount is calculated based on the current ratio of total stBLX supply to `totalLiquidStakedBLX`.
- **Access Control**: `nonReentrant`
- **Events Emitted**: `LiquidStaked`
- **Validation Rules**: Deposit amount must be $> 0$.

##### 6. unstakeLiquid
- **Visibility**: `external`
- **Parameters**:
  - `_stBlxAmount` (`uint256`): stBLX amount to burn.
- **Returns**: None
- **Description**: Burns stBLX to return the corresponding share of backing BLX, including accrued compounding yields.
- **Access Control**: `nonReentrant`
- **Events Emitted**: `LiquidUnstaked`
- **Validation Rules**: `_stBlxAmount` must be $> 0$; user must hold sufficient stBLX.

##### 7. updatePool (Classic Rewards Accrual)
- **Visibility**: `public`
- **Parameters**: None
- **Returns**: None
- **Description**: Updates `accRewardPerShare` based on classic staking volume and elapsed time. Updates `lastRewardTimestamp`.
- **Access Control**: None

##### 8. updateLiquidPool (Liquid APY Compounding)
- **Visibility**: `public`
- **Parameters**: None
- **Returns**: None
- **Description**: Accrues virtual yield to `totalLiquidStakedBLX` based on APY parameters. Requests new BLX minting to back the updated total. Updates `lastLiquidRewardTimestamp`.
- **Access Control**: None

##### 9. getstBLXExchangeRate
- **Visibility**: `public` `view`
- **Parameters**: None
- **Returns**: `uint256` (Exchange rate scaled to 1e18)
- **Description**: Returns how much BLX is equal to 1 stBLX (base 1e18), accounting for pending virtual APY rewards in real-time.
- **Access Control**: None

##### 10. getPendingClassicRewards
- **Visibility**: `external` `view`
- **Parameters**:
  - `_user` (`address`): Address of the user.
- **Returns**: `uint256` (Total pending rewards)
- **Description**: Evaluates and aggregates all classic staking rewards accrued for a user.
- **Access Control**: None

##### 11. getUserStakesCount
- **Visibility**: `external` `view`
- **Parameters**:
  - `_user` (`address`): User address.
- **Returns**: `uint256` (Stake list count)
- **Description**: Returns the size of the stakes array for a user.
- **Access Control**: None

##### 12. setEarlyExitPenalty
- **Visibility**: `external`
- **Parameters**:
  - `_bps` (`uint256`): Penalty in basis points.
- **Returns**: None
- **Description**: Sets the early withdrawal penalty rate.
- **Access Control**: `onlyOwner`
- **Events Emitted**: `EarlyExitPenaltyUpdated`
- **Validation Rules**: `_bps` must be $\le 3000$ (30% max penalty).

##### 13. setRewardRate
- **Visibility**: `external`
- **Parameters**:
  - `_newRate` (`uint256`): New reward rate per second.
- **Returns**: None
- **Description**: Updates the classic rewards emission speed.
- **Access Control**: `onlyOwner`

##### 14. setLiquidStakingAPY
- **Visibility**: `external`
- **Parameters**:
  - `_newAPY` (`uint256`): New liquid staking APY.
- **Returns**: None
- **Description**: Updates the APY rate for liquid staking.
- **Access Control**: `onlyOwner`

#### Business Logic
1. **Classic Flow**: Staking records a entry. Unstaking checks maturity against `block.timestamp`. If mature, full rewards are computed; if not, 15% is deducted, and rewards are zeroed.
2. **Liquid Flow**: Liquid staking utilizes an exchange rate:
   $$\text{Rate} = \frac{\text{Backing BLX}}{\text{Total stBLX Supply}}$$
   As virtual yield compounds in `updateLiquidPool`, the numerator increases while the denominator remains stable, causing the exchange rate to grow over time.

#### Dependencies
- OpenZeppelin `SafeERC20`
- OpenZeppelin `ReentrancyGuard`
- OpenZeppelin `Ownable`

#### Security Requirements
- Reentrancy protection on all entry/exit paths.
- Proper access control on parameters updating.
- Safely handle failed mint attempts via fallback token reserves.

---

### 4. Contract: BlumeVault

#### Purpose
`BlumeVault` is a secure, EIP-4626 compliant yield-compounding farming vault. It accepts BLX deposits, mints `vBLX` shares, and automatically stakes vault reserves into `BlumeStaking` to earn rewards. It supports flexible and locked deposits, virtual yield compounding (10-15% APY), and features emergency exit mechanisms when paused.

#### Functional Requirements
- **Standard EIP-4626 compliance** (totalAssets, convertToShares, deposit, withdraw, redeem, etc.).
- **Role-Based Access Control (RBAC)**: Manage admin, pausing, and yield settings.
- **Automated Farming**: Stake idle BLX reserves in the `BlumeStaking` flexible pool.
- **Compounding Harvesting**: Claim classic staking rewards and re-stake them to compound vault assets.
- **Virtual Yield Accrual**: Accumulate base APY (10%) or locked APY (15% for 30-day deposits) rewards, minting BLX to back vault share values.
- **Emergency Withdrawal**: Permit immediate share redemptions bypassing locking constraints when paused.
- **Withdrawal Fee**: Charge 0.5% standard fee sent to the treasury.

#### State Variables
| Variable Name | Type | Value / Details |
| --- | --- | --- |
| `PAUSER_ROLE` | `bytes32` | Role hash for emergency pausing. |
| `YIELD_MANAGER_ROLE` | `bytes32` | Role hash for updating APY parameters. |
| `stakingContract` | `BlumeStaking` | Immutable reference to the BlumeStaking contract. |
| `nextUnstakeIndex` | `uint256` | Staking array index offset for optimized withdrawals. |
| `baseYieldAPY` | `uint256` | APY for flexible depositors (default: 10%). |
| `lockedYieldAPY` | `uint256` | APY for 30-day locked depositors (default: 15%). |
| `totalYieldAccrued` | `uint256` | Aggregated virtual yield token count. |
| `lastYieldAccrualTimestamp` | `uint256` | Last time virtual compounding was assessed. |
| `withdrawalFeeBps` | `uint256` | Withdrawal fee in basis points (default: 50 bps = 0.5%). |
| `treasury` | `address` | Destination address for fee collections. |

#### Structs
*None defined.*

#### Enums
*None defined.*

#### Mappings
| Mapping Key | Mapping Value | Description |
| --- | --- | --- |
| `userUnlockTime` | `address => uint256` | Tracks individual withdrawal lock expiration times. |
| `isLockedDeposit` | `address => bool` | Identifies if a depositor is under a 30-day locked boosted schedule. |

#### Events
- `VaultDeposited(address indexed user, uint256 assets, uint256 shares, bool isLocked)`
- `VaultWithdrawn(address indexed user, uint256 assets, uint256 shares)`
- `YieldCompounded(uint256 compoundAmount)`
- `EmergencyExit(address indexed user, uint256 assets)`
- `APYUpdated(uint256 newBaseAPY, uint256 newLockedAPY)`

#### Errors (Custom Messages)
- `"Vault: Staking address cannot be zero"`
- `"Vault: Treasury address cannot be zero"`
- `"Vault: Deposit is currently locked"`
- `"Vault: Shares are currently locked"`
- `"Vault: No shares owned"`
- `"Vault: Yield limit exceeded"`
- `"Vault: Fee cap 5%"`
- `"Vault: Zero address"`

#### Modifiers
- `onlyRole(bytes32 role)`: Enforces RBAC permissions.
- `whenNotPaused` / `whenPaused`: Manages emergency triggers.
- `nonReentrant`: Reentrancy protection.

#### Smart Contract Functions

##### 1. Constructor
- **Visibility**: `public`
- **Parameters**:
  - `_blxToken` (`IERC20`): Backing token asset.
  - `_stakingAddress` (`address`): BlumeStaking deployment address.
  - `_treasury` (`address`): Treasury wallet address.
- **Returns**: None
- **Description**: Sets up ERC-4626 name ("Vaulted Blume Token") and symbol ("vBLX"). Configures roles for deployer, sets initial accrual timestamp, and approves infinite BLX spending to the Staking contract.
- **Access Control**: None

##### 2. totalAssets (Override)
- **Visibility**: `public` `view` `override`
- **Parameters**: None
- **Returns**: `uint256` (Total backing tokens)
- **Description**: Calculates total assets backed by the vault. Returns the physical BLX balance held in the contract plus the active principal staked by the vault in the Staking contract.
- **Access Control**: None

##### 3. deposit (Override)
- **Visibility**: `public` `override`
- **Parameters**:
  - `assets` (`uint256`): Deposit amount.
  - `receiver` (`address`): Account receiving shares.
- **Returns**: `uint256` (Shares minted)
- **Description**: Performs EIP-4626 deposit, records a 1-day lock to prevent front-running, and auto-stakes the principal into the Staking contract.
- **Access Control**: `whenNotPaused`, `nonReentrant`
- **Events Emitted**: `VaultDeposited`

##### 4. depositLocked
- **Visibility**: `external`
- **Parameters**:
  - `assets` (`uint256`): Deposit amount.
  - `receiver` (`address`): Account receiving shares.
- **Returns**: `uint256` (Shares minted)
- **Description**: Deposits BLX and locks it for 30 days to earn the boosted 15% APY yield. Auto-stakes the principal into the Staking contract.
- **Access Control**: `whenNotPaused`, `nonReentrant`
- **Events Emitted**: `VaultDeposited`

##### 5. _unstakeNeeded (Internal Helper)
- **Visibility**: `internal`
- **Parameters**:
  - `needed` (`uint256`): BLX amount required.
- **Returns**: None
- **Description**: Loops through vault-owned staking positions and unstakes funds from BlumeStaking until the required amount is met.
- **Access Control**: None

##### 6. withdraw (Override)
- **Visibility**: `public` `override`
- **Parameters**:
  - `assets` (`uint256`): Net assets requested.
  - `receiver` (`address`): Recipient address.
  - `owner` (`address`): Owner of vault shares.
- **Returns**: `uint256` (Shares burned)
- **Description**: Burns shares to return BLX. Validates the unlock lock, charges a 0.5% fee to the treasury, unstakes backing tokens from the Staking contract if needed, and transfers the remaining tokens.
- **Access Control**: `nonReentrant`
- **Events Emitted**: `VaultWithdrawn`
- **Validation Rules**: Current time must be $\ge$ `userUnlockTime[owner]`.

##### 7. redeem (Override)
- **Visibility**: `public` `override`
- **Parameters**:
  - `shares` (`uint256`): Shares to burn.
  - `receiver` (`address`): Recipient address.
  - `owner` (`address`): Owner of vault shares.
- **Returns**: `uint256` (Assets returned)
- **Description**: Burns shares to return BLX. Validates lock times, deducts fees, unstakes underlying from Staking contract if needed, and transfers the remaining tokens.
- **Access Control**: `nonReentrant`
- **Events Emitted**: `VaultWithdrawn`
- **Validation Rules**: Current time must be $\ge$ `userUnlockTime[owner]`.

##### 8. accrueVirtualYield
- **Visibility**: `public`
- **Parameters**: None
- **Returns**: None
- **Description**: Accrues vault base APY compounding yield, minting BLX to the vault to inflate shares value.
- **Access Control**: None

##### 9. compound
- **Visibility**: `external`
- **Parameters**: None
- **Returns**: None
- **Description**: Claims staking rewards from BlumeStaking and re-stakes them to compound returns.
- **Access Control**: `nonReentrant`
- **Events Emitted**: `YieldCompounded`

##### 10. emergencyWithdraw
- **Visibility**: `external`
- **Parameters**: None
- **Returns**: None
- **Description**: Allows users to withdraw principal immediately bypassing locks when vault is paused.
- **Access Control**: `whenPaused`, `nonReentrant`
- **Events Emitted**: `EmergencyExit`

##### 11. pause / unpause
- **Visibility**: `external`
- **Parameters**: None
- **Returns**: None
- **Description**: Pauses/unpauses deposits in the vault.
- **Access Control**: `onlyRole(PAUSER_ROLE)`

##### 12. setYieldAPY
- **Visibility**: `external`
- **Parameters**:
  - `_baseAPY` (`uint256`): Flexible APY rate.
  - `_lockedAPY` (`uint256`): Locked APY rate.
- **Returns**: None
- **Description**: Updates vault APYs.
- **Access Control**: `onlyRole(YIELD_MANAGER_ROLE)`
- **Validation Rules**: `_baseAPY` must be $\le 25$, `_lockedAPY` must be $\le 50$.

##### 13. setWithdrawalFee
- **Visibility**: `external`
- **Parameters**:
  - `_bps` (`uint256`): Fee in basis points.
- **Returns**: None
- **Description**: Updates the withdrawal fee.
- **Access Control**: `onlyRole(DEFAULT_ADMIN_ROLE)`
- **Validation Rules**: `_bps` must be $\le 500$ (5%).

##### 14. setTreasury
- **Visibility**: `external`
- **Parameters**:
  - `_treasury` (`address`): Treasury wallet address.
- **Returns**: None
- **Description**: Updates the treasury address.
- **Access Control**: `onlyRole(DEFAULT_ADMIN_ROLE)`
- **Validation Rules**: Address must not be zero.

#### Business Logic
1. **Compounding Flow**:
   - `totalAssets()` evaluates all physical and staked BLX.
   - When users interact, `accrueVirtualYield()` mints backing tokens into the vault, increasing the `totalAssets` value relative to `totalSupply()` of shares, causing `vBLX` to appreciate.
   - `compound()` harvests rewards from the staking manager and re-stakes them into classic staking to compound yield.

#### Dependencies
- OpenZeppelin `ERC4626`
- OpenZeppelin `ERC20`
- OpenZeppelin `AccessControl`
- OpenZeppelin `Pausable`
- OpenZeppelin `ReentrancyGuard`

#### Security Requirements
- Role segregation for admin, pauser, and yield manager.
- Reentrancy locks on all deposit, withdrawal, and compound paths.
- Sandwich protection via a 1-day lock on flexible deposits.

---

### 5. Contract: BlumeLP

#### Purpose
`BlumeLP` is a constant product ($x \cdot y = k$) AMM pool for BLX/USDT swaps. It supports liquidity provision rewards (LP shares), charges a 0.3% trading fee, and implements price oracle validation checks to prevent slippage manipulation, flash loan attacks, and sandwiching.

#### Functional Requirements
- **Add Liquidity**: Deposit equal value ratio of token0 (BLX) and token1 (USDT), minting LP shares.
- **Remove Liquidity**: Burn LP shares to withdraw underlying pool reserves.
- **Swap**: Swap input tokens for output tokens, enforcing a 0.3% trading fee.
- **Oracle Validation**: Validate the spot reserves price ratio against a Chainlink price feed before swap and liquidity operations to block front-running and flash loan manipulation.
- **Admin Configuration**: Allow the owner to update the oracle address and set the maximum allowed price deviation.

#### State Variables
| Variable Name | Type | Value / Details |
| --- | --- | --- |
| `token0` | `IERC20` | BLX Token address (immutable). |
| `token1` | `IERC20` | USDT Token address (immutable). |
| `reserve0` | `uint256` | Pool reserve of token0. |
| `reserve1` | `uint256` | Pool reserve of token1. |
| `SWAP_FEE_BPS` | `uint256` | Trading fee in basis points (constant: 30 bps = 0.3%). |
| `priceOracle` | `IChainlinkOracle` | Address of the Chainlink price feed oracle. |
| `maxOracleDeviationBps` | `uint256` | Maximum price deviation in basis points (default: 500 bps = 5%). |

#### Structs
*None defined.*

#### Enums
*None defined.*

#### Mappings
*None defined (inherits standard ERC20 mappings).*

#### Events
- `LiquidityAdded(address indexed provider, uint256 amount0, uint256 amount1, uint256 lpShares)`
- `LiquidityRemoved(address indexed provider, uint256 amount0, uint256 amount1, uint256 lpShares)`
- `Swap(address indexed swapper, address indexed tokenIn, uint256 amountIn, uint256 amountOut)`
- `OracleUpdated(address indexed oldOracle, address indexed newOracle)`
- `DeviationThresholdUpdated(uint256 oldDeviation, uint256 newDeviation)`

#### Errors (Custom Messages)
- `"LP: Zero address not allowed"`
- `"LP: Insufficient liquidity created"`
- `"LP: Invalid share count"`
- `"LP: Insufficient reserves returned"`
- `"LP: Invalid token"`
- `"LP: Amount must be > 0"`
- `"LP: Slippage limit reached"`
- `"LP: Exceeds pool reserve"`
- `"LP: Invalid oracle feed data"`
- `"LP: Spot ratio deviates too much from Price Oracle"`
- `"LP: Invalid address"`
- `"LP: Threshold too wide"`

#### Modifiers
- `onlyOwner` (inherits from OZ `Ownable`)
- `nonReentrant` (inherits from OZ `ReentrancyGuard`)

#### Smart Contract Functions

##### 1. Constructor
- **Visibility**: `public`
- **Parameters**:
  - `_token0` (`address`): BLX token address.
  - `_token1` (`address`): USDT token address.
  - `_oracleAddress` (`address`): Oracle contract address.
- **Returns**: None
- **Description**: Sets token interfaces, sets priceOracle reference, and sets name "Blume BLX-USDT LP Share" and symbol "BLX-USDT-LP".
- **Access Control**: None

##### 2. addLiquidity
- **Visibility**: `external`
- **Parameters**:
  - `amount0Desired` (`uint256`): Amount of BLX to deposit.
  - `amount1Desired` (`uint256`): Amount of USDT to deposit.
- **Returns**: `shares` (`uint256`)
- **Description**: Transfers BLX and USDT into the pool, calculates LP shares, updates reserves, and mints LP tokens to the provider. Checks price oracle first.
- **Access Control**: `nonReentrant`
- **Events Emitted**: `LiquidityAdded`
- **Validation Rules**: Validates price ratio against the oracle; `shares` minted must be $> 0$.

##### 3. removeLiquidity
- **Visibility**: `external`
- **Parameters**:
  - `lpShares` (`uint256`): Amount of LP shares to burn.
- **Returns**: 
  - `amount0` (`uint256`): BLX returned.
  - `amount1` (`uint256`): USDT returned.
- **Description**: Burns LP shares to withdraw proportional pool reserves.
- **Access Control**: `nonReentrant`
- **Events Emitted**: `LiquidityRemoved`
- **Validation Rules**: `lpShares` must be $> 0$; output amounts must be $> 0$.

##### 4. swap
- **Visibility**: `external`
- **Parameters**:
  - `tokenInAddress` (`address`): Address of the input token.
  - `amountIn` (`uint256`): Input amount.
  - `minAmountOut` (`uint256`): Minimum acceptable output amount (slippage check).
- **Returns**: `amountOut` (`uint256`)
- **Description**: Swaps input tokens for output tokens, charging a 0.3% fee. Verifies the output amount against `minAmountOut` and validates the price ratio against the oracle before execution.
- **Access Control**: `nonReentrant`
- **Events Emitted**: `Swap`
- **Validation Rules**: `tokenInAddress` must be valid; `amountIn` must be $> 0$; `amountOut` must be $\ge$ `minAmountOut` and $<$ than output reserve.

##### 5. validatePriceWithOracle
- **Visibility**: `public` `view`
- **Parameters**: None
- **Returns**: None
- **Description**: Validates that the pool's spot reserves price ratio does not deviate from the oracle price feed by more than `maxOracleDeviationBps`. Scales reserves to match oracle precision.
- **Access Control**: None
- **Validation Rules**: Reverts if the oracle price is $\le 0$, or if the deviation is exceeded.

##### 6. setPriceOracle
- **Visibility**: `external`
- **Parameters**:
  - `_oracle` (`address`): New oracle address.
- **Returns**: None
- **Description**: Updates the oracle contract address.
- **Access Control**: `onlyOwner`
- **Events Emitted**: `OracleUpdated`
- **Validation Rules**: `_oracle` address must not be zero.

##### 7. setMaxDeviation
- **Visibility**: `external`
- **Parameters**:
  - `_bps` (`uint256`): New deviation threshold in basis points.
- **Returns**: None
- **Description**: Updates the maximum price deviation allowed.
- **Access Control**: `onlyOwner`
- **Events Emitted**: `DeviationThresholdUpdated`
- **Validation Rules**: `_bps` must be $\le 2000$ (20% max deviation).

##### 8. getAmountOut
- **Visibility**: `external` `view`
- **Parameters**:
  - `tokenInAddress` (`address`): Address of the input token.
  - `amountIn` (`uint256`): Input amount.
- **Returns**: `amountOut` (`uint256`)
- **Description**: View function to calculate swap output amount including the 0.3% fee.
- **Access Control**: None

#### Business Logic
1. **Swap Mechanism**:
   - Implements the constant product formula:
     $$(x + \Delta x \cdot (1 - f)) \cdot (y - \Delta y) = k$$
     where $f$ is the 0.3% fee.
   - Outputs:
     $$\Delta y = \frac{\Delta x \cdot (1 - f) \cdot y}{x + \Delta x \cdot (1 - f)}$$
2. **Oracle Shield**: `swap` and `addLiquidity` trigger `validatePriceWithOracle()`. The contract queries the oracle feed and computes:
   $$\text{Spot Price} = \frac{\text{reserve1} \cdot 10^{\text{oracleDecimals}} \cdot 10^{18}}{\text{reserve0} \cdot 10^6}$$
   It compares `Spot Price` and `oraclePrice`. If the deviation exceeds the threshold, it reverts.

#### Dependencies
- OpenZeppelin `ERC20`
- OpenZeppelin `SafeERC20`
- OpenZeppelin `ReentrancyGuard`
- OpenZeppelin `Ownable`
- OpenZeppelin `Math`

#### Security Requirements
- Reentrancy protection on liquidity provisioning and swaps.
- Oracle protection check to block sandwich attacks and flash loan pool manipulation.
- Slippage parameter verification (`minAmountOut`) in swap calls.

---

### 6. Contract: MockUSDT

#### Purpose
`MockUSDT` is a mock implementation of the Tether USD token. It features a public faucet minting function to enable users to easily acquire test tokens on development networks.

#### Functional Requirements
- **Standard ERC-20 compliance**.
- **Decimals Override**: Override ERC-20 decimals to return 6 (mimicking real USDT).
- **Public Faucet Minting**: Allow any address to call `mint` to receive test USDT.

#### State Variables
*None defined (inherits standard ERC20 properties).*

#### Structs/Enums/Mappings/Events/Errors/Modifiers
*None defined.*

#### Smart Contract Functions

##### 1. Constructor
- **Visibility**: `public`
- **Description**: Sets token name ("Mock Tether USD"), symbol ("USDT"), and mints 1 Billion USDT (`1_000_000_000 * 10**6`) to the deployer.
- **Access Control**: None

##### 2. decimals
- **Visibility**: `public` `view` `virtual` `override`
- **Returns**: `uint8` (Returns 6)
- **Description**: Overrides standard ERC-20 decimals to simulate genuine USDT.

##### 3. mint
- **Visibility**: `external`
- **Parameters**:
  - `to` (`address`): Recipient wallet address.
  - `amount` (`uint256`): Number of tokens to mint (6 decimals).
- **Returns**: None
- **Description**: Public faucet minting function.
- **Access Control**: None

#### Dependencies
- OpenZeppelin `ERC20`
- OpenZeppelin `Ownable`

---

### 7. Contract: MockOracle

#### Purpose
`MockOracle` simulates a Chainlink AggregatorV3 price feed contract, supplying mock price data. It features a public function to manually update the price, enabling developers to simulate market price movements or adversarial price manipulation conditions.

#### Functional Requirements
- **Decimals Interface**: Return mock price decimals.
- **Chainlink latestRoundData Interface**: Return mock feed statistics (roundId, price, timestamps).
- **Manual Price Updates**: Allow the operator to manually update the stored price feed.

#### State Variables
- `price` (`int256 private`): The simulated price.
- `decimalPlaces` (`uint8 private`): Precision decimals (default: 6).
- `description` (`string public`): Description tag.

#### Structs/Enums/Mappings/Events/Errors/Modifiers
*None defined.*

#### Smart Contract Functions

##### 1. Constructor
- **Visibility**: `public`
- **Parameters**:
  - `_initialPrice` (`int256`): Starting mock price.
  - `_decimals` (`uint8`): Price decimal precision.
  - `_desc` (`string`): Oracle description text.

##### 2. decimals
- **Visibility**: `external` `view`
- **Returns**: `uint8`

##### 3. latestRoundData
- **Visibility**: `external` `view`
- **Returns**: 
  - `roundId` (`uint80`)
  - `answer` (`int256`)
  - `startedAt` (`uint256`)
  - `updatedAt` (`uint256`)
  - `answeredInRound` (`uint80`)
- **Description**: Simulates the Chainlink feed query, returning `(1, price, block.timestamp, block.timestamp, 1)`.

##### 4. setPrice
- **Visibility**: `external`
- **Parameters**:
  - `_newPrice` (`int256`): Updated price feed value.
- **Description**: Updates the price.
- **Access Control**: None (mock operator)

#### Dependencies
*None.*

---

## Phase 2 – Testing Requirements

A comprehensive testing checklist must be implemented across all contracts, covering unit tests, integration tests, and security tests.

### Unit Tests

#### 1. BLXToken Tests
- [ ] **Positive Cases**: Minting by authorized minters, successful token burning, and limit exemptions.
- [ ] **Negative Cases**: Revert minting calls from unauthorized accounts, and verify transfer limits apply to standard users.
- [ ] **Boundary Tests**: Confirm mints exactly up to `MAX_SUPPLY` succeed, and minting any amount exceeding `MAX_SUPPLY` reverts.
- [ ] **Access Control Tests**: Verify `addMinter`, `removeMinter`, `setExcludeFromLimits`, and `updateLimits` are only callable by the owner.
- [ ] **Event Tests**: Assert correct emissions of `MinterAdded`, `MinterRemoved`, `ExcludedFromLimits`, and `LimitsUpdated` events.
- [ ] **Gas Tests**: Validate that the anti-whale transfer hook adds negligible gas overhead to standard transfers.
- [ ] **Failure Tests**: Verify transfer reverts when standard user transactions exceed `maxTxAmount` limit.
- [ ] **Edge Cases**: Verify transfer succeeds when the sender or recipient is excluded from limits, even if limits are exceeded.
- [ ] **State Transition Tests**: Ensure updating limit parameters successfully changes limits and affects subsequent user transfers.

#### 2. stBLXToken Tests
- [ ] **Positive Cases**: Mint and burn tokens by owner (`BlumeStaking`).
- [ ] **Negative Cases**: Revert mint and burn calls from any non-owner account.
- [ ] **Access Control Tests**: Ensure only the owner holds permission to mint and burn.

#### 3. BlumeStaking Tests
- [ ] **Positive Cases**: Stake classic with flexible and locked terms, stake liquid, and retrieve user stakes lists.
- [ ] **Negative Cases**: Reject staking zero amounts, classic unstaking with out-of-bounds indices, and liquid unstaking with insufficient balances.
- [ ] **Boundary Tests**: Verify unstaking classic stakes exactly on the maturity timestamp results in no penalty and correct rewards.
- [ ] **Access Control Tests**: Ensure owner-restricted functions (`setEarlyExitPenalty`, `setRewardRate`, `setLiquidStakingAPY`) cannot be called by standard users.
- [ ] **Event Tests**: Check correct emission of `ClassicStaked`, `ClassicUnstaked`, `RewardClaimed`, `LiquidStaked`, and `LiquidUnstaked` events.
- [ ] **Early Penalty Tests**: Verify early classic unstaking applies a 15% penalty to the principal and zero rewards are disbursed.
- [ ] **State Transition Tests**: Verify stBLX exchange rate updates correctly as time passes and validator yield accumulates.

#### 4. BlumeVault Tests
- [ ] **Positive Cases**: Deposit flexible and locked terms, withdraw, redeem, and auto-farm compounding.
- [ ] **Negative Cases**: Prevent withdraw/redeem before lock time expires, and block deposits when the vault is paused.
- [ ] **Access Control Tests**: Ensure roles (`PAUSER_ROLE`, `YIELD_MANAGER_ROLE`, `DEFAULT_ADMIN_ROLE`) are enforced correctly.
- [ ] **Fee Tests**: Verify the 0.5% withdrawal fee is deducted and transferred to the treasury address.
- [ ] **Compounding Tests**: Verify `compound()` claims rewards from Staking and stakes them back, increasing total assets.
- [ ] **Emergency Exit Tests**: Verify users can redeem shares when paused using `emergencyWithdraw` without enforcing locks.

#### 5. BlumeLP Tests
- [ ] **Positive Cases**: Add liquidity, remove liquidity, and swap tokens.
- [ ] **Negative Cases**: Reject swaps with output less than `minAmountOut`, and block swaps when reserves deviate from the oracle price.
- [ ] **Boundary Tests**: Verify slippage limit checks for exact matches of output and `minAmountOut`.
- [ ] **Access Control Tests**: Confirm `setPriceOracle` and `setMaxDeviation` are only callable by the owner.
- [ ] **Oracle Validation Tests**: Validate that the pool rejects transactions when the spot price ratio deviates from the oracle price by more than 5%.

---

### Integration Tests

- [ ] **Contract-to-Contract Interaction**: Verify `BlumeVault` deposits automatically trigger staking calls in `BlumeStaking`.
- [ ] **Oracle Integration**: Verify `BlumeLP` queries `MockOracle` correctly during swaps and liquidity operations.
- [ ] **ERC20 Interaction**: Validate that `BlumeStaking` pulls and pushes BLX/stBLX tokens correctly on stakes/unstakes.
- [ ] **Frontend Integration**: Test MetaMask integration with contract calls (deposit, swap, stake) in simulated web3 mode.
- [ ] **Backend Integration**: Verify the Express server caches contract events and transaction hashes correctly.

---

### Security Tests

- [ ] **Reentrancy**: Test all state-changing functions against reentrancy attacks (e.g., using a malicious receiver contract).
- [ ] **Flash Loan Protection**: Simulate flash loan price manipulation of the LP pool and verify the oracle deviation check reverts the transaction.
- [ ] **Front-Running**: Test swap operations against sandwich attacks using high and low slippage margins.
- [ ] **Access Control**: Verify all restricted functions revert with appropriate errors when invoked by unauthorized accounts.
- [ ] **Oracle Manipulation**: Verify the LP pool blocks swaps when the oracle price feed is manipulated.
- [ ] **Pause Mechanism**: Verify `BlumeVault` deposits are blocked when the contract is paused, and `emergencyWithdraw` is enabled.

---

### Expected Test Coverage

All contracts must meet the following minimum test coverage thresholds:
- **90%** Statements
- **90%** Branches
- **90%** Functions
- **90%** Lines

---

## Phase 3 – Deployment

### Deployment Order
1. **Deploy `BLXToken`**: Core ERC-20 utility token.
2. **Deploy `stBLXToken`**: Liquid staked representation token.
3. **Deploy `BlumeStaking`**: Staking manager contract (connects `BLXToken` and `stBLXToken`).
4. **Deploy `MockUSDT`**: Mock stablecoin (testnet/sandbox).
5. **Deploy `MockOracle`**: Mock price feed oracle (testnet/sandbox).
6. **Deploy `BlumeLP`**: Constant product pool (connects BLX, USDT, and Oracle).
7. **Deploy `BlumeVault`**: Yield farming vault (connects BLX, Staking, and Treasury).

### Constructor Parameters

| Contract | Parameter Name | Type | Value / Details |
| --- | --- | --- | --- |
| **BLXToken** | None | - | - |
| **stBLXToken** | None | - | - |
| **BlumeStaking** | `_blxToken` | `address` | Deployed `BLXToken` address. |
| | `_stBlxToken` | `address` | Deployed `stBLXToken` address. |
| **MockUSDT** | None | - | - |
| **MockOracle** | `_initialPrice` | `int256` | `500000` ($0.50 scaled to 6 decimals). |
| | `_decimals` | `uint8` | `6` (matching USDT precision). |
| | `_desc` | `string` | `"BLX / USDT price feed"`. |
| **BlumeLP** | `_token0` | `address` | Deployed `BLXToken` address. |
| | `_token1` | `address` | Deployed `MockUSDT` address. |
| | `_oracleAddress` | `address` | Deployed `MockOracle` address. |
| **BlumeVault** | `_blxToken` | `address` | Deployed `BLXToken` address. |
| | `_stakingAddress` | `address` | Deployed `BlumeStaking` address. |
| | `_treasury` | `address` | Treasury wallet address. |

### Environment Variables
```env
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
PRIVATE_KEY=your_metamask_private_key
ETHERSCAN_API_KEY=your_etherscan_api_key
```

### Network Configuration
Hardhat configuration file (`hardhat.config.js`):
- Compiler Version: `0.8.26`
- Optimizer: Enabled (`runs: 200`)
- Networks:
  - `localhost` (Port 8545)
  - `sepolia` (Chain ID 11155111)

### Deployment Scripts
- `scripts/deploy.js`: Main deployment orchestrator script.
- `scripts/redeploy.js`: Incremental redeployment helper for specific contracts.

### Post-Deployment Initialization & Permissions
1. **Transfer `stBLXToken` Ownership**: Transfer contract ownership to the `BlumeStaking` contract.
2. **Authorize Minters**: Add `BlumeStaking` as an authorized minter on `BLXToken`.
3. **Exclude Limits**: Exclude `BlumeStaking`, `BlumeLP`, and `BlumeVault` from `BLXToken` transfer limits.
4. **Seed Reserves**: Seed the `BlumeLP` pool with initial reserves (e.g. 100k BLX / 50k USDT) and `BlumeVault` with initial deposits.

### Smoke Testing Checklist
- [ ] Verify `BLXToken` initial supply is minted to the deployer.
- [ ] Confirm `stBLXToken` ownership belongs to the Staking contract.
- [ ] Test a classic flexible stake and verify staker records.
- [ ] Execute a mock swap in `BlumeLP` and ensure price validation checks succeed.
- [ ] Perform a deposit and withdrawal in `BlumeVault` to confirm ERC-4626 operations.

---

## Phase 4 – Contract Verification

### Explorer Verification
Verify deployed contracts on Etherscan/Blockscout.
- Compiler Version: `0.8.26`
- Optimization Settings: Enabled with `200` runs.
- EVM Target: `cancun`.

### Constructor Arguments
Generate ABI-encoded constructor parameters for verification:
- `BlumeStaking`: `abi.encode(blxAddress, stBlxAddress)`
- `BlumeLP`: `abi.encode(blxAddress, usdtAddress, oracleAddress)`
- `BlumeVault`: `abi.encode(blxAddress, stakingAddress, treasuryAddress)`

### Verification Command Example
```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGUMENTS>
```

---

## Phase 5 – Documentation

For every contract in the ecosystem, the following documentation structure must be maintained:

```
├── docs/
│   ├── Architecture.md (Overview of contracts and token flows)
│   ├── Deployment_Guide.md (Step-by-step testnet/mainnet guides)
│   ├── Upgrade_Guide.md (Role transfer and parameter tweaks)
│   └── API_Reference.md (Generated NatSpec function documentation)
```

### Required Diagrams
1. **Architecture Diagram**: Visualizing contract interactions (Token $\leftrightarrow$ Staking $\leftrightarrow$ LP $\leftrightarrow$ Vault).
2. **Sequence Diagram**: User deposit/withdraw flow and AMM swap flow.
3. **Contract Interaction Diagram**: Detailing RBAC access and transfer limit exemptions.

---

## Phase 6 – Security Audit Checklist

Before deployment, verify the contracts against the following audit checklist.

### Risk Categories

#### Critical Risks
- **Reentrancy**: Reentrancy on staking claims or vault withdraws.
- **Oracle Manipulation**: Flash loan-funded spot price manipulation on the AMM pool.

#### High Risks
- **Asset Accounting Errors**: Inconsistent asset balances in EIP-4626 vault operations (e.g., ignoring staked reserves in `totalAssets()`).
- **Access Control Failures**: Arbitrary minting or burning permissions.

#### Medium Risks
- **Whale Limit Bypasses**: Unauthorized user transfers bypassing anti-whale limits.
- **Slippage Tolerance**: Low or zero slippage checks on AMM swaps.

#### Low Risks
- **Centralization Risks**: Single-point ownership vulnerabilities.
- **Gas Inefficiencies**: Loops over unbounded user staking lists.

### Automated Analysis
- **Slither**: Run static analysis before deployment.
- **MythX**: Perform automated smart contract scans.

---

## Phase 7 – Final Deliverables

A complete delivery checklist must be checked off before the production release:

- [ ] **Smart Contracts**: Compiled Solidity contracts with no errors.
- [ ] **Deployment Scripts**: Robust deploy and verification scripts.
- [ ] **Hardhat Configuration**: Configured compilers, optimizers, and networks.
- [ ] **Unit Tests**: Coverage exceeding 90% across all metrics.
- [ ] **Integration Tests**: Tested contract-to-contract flow.
- [ ] **Security Tests**: Oracle deviation and reentrancy validation.
- [ ] **Deployment Documentation**: Complete step-by-step setup guides.
- [ ] **Verified Contracts**: Etherscan verified addresses.
- [ ] **Architecture Diagrams**: Detailed sequence and interaction flow charts.
- [ ] **API Documentation**: Full NatSpec-compatible contract API references.
