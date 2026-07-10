# Contract Verification Guide

## Overview
The `verify.js` script verifies all deployed SX Trading Suite contracts on Etherscan-compatible block explorers.

## Prerequisites

1. **Etherscan API Key**: Set in your `.env` file
   ```
   ETHERSCAN_API_KEY=your_api_key_here
   ```

2. **Contract Addresses**: All deployed contract addresses must be in your `.env` file:
   ```
   USDT_ADDRESS=0x...
   ORACLE_ADDRESS=0x...
   SXPT_ADDRESS=0x...
   SXLT_ADDRESS=0x...
   SXLS_ADDRESS=0x...
   SXUD_ADDRESS=0x...
   SXHOP_ADDRESS=0x...
   SXADMIN_ADDRESS=0x...
   ```

3. **Device Addresses** (for SXAdmin): Optional, defaults to DEPLOYER_ADDRESS
   ```
   DEVICE1_ADDRESS=0x...
   DEVICE2_ADDRESS=0x...
   DEVICE3_ADDRESS=0x...
   DEPLOYER_ADDRESS=0x...
   ```

## Usage

### Verify on Hoodi Testnet
```bash
npm run verify:hoodi
```

### Verify on Sepolia
```bash
npm run verify:sepolia
```

### Direct Hardhat Command
```bash
npx hardhat run scripts/verify.js --network hoodiTestnet
npx hardhat run scripts/verify.js --network sepolia
```

## What Gets Verified

The script verifies these contracts in order:
1. **MockUSDT** - Mock USDT token (no constructor args)
2. **MockOracle** - Mock price oracle (no constructor args)
3. **SXPT** - Perpetual Trading (USDT address, Oracle address)
4. **SXLT** - Asset Lending (Oracle address)
5. **SXLS** - Leveraged Spot Trading (USDT address, Oracle address)
6. **SXUD** - Unified Dashboard (SXPT, SXLT, SXLS, Oracle addresses)
7. **SXHOP** - Hidden Orders (SXLS address, USDT address)
8. **SXAdmin** - Multi-Sig Admin (3 device addresses, SXPT, SXLT, SXLS addresses)

## Expected Output

```
====================================================
Contract Verification Script
Network: hoodiTestnet
====================================================

🔍 Verifying MockUSDT at 0x...
✅ MockUSDT verified successfully!

🔍 Verifying MockOracle at 0x...
✅ MockOracle is already verified!

...

====================================================
Verification Complete!
====================================================
```

## Troubleshooting

### Error: "address is not a contract"
- Contract hasn't been deployed yet
- Check contract address in `.env` file

### Error: "Constructor arguments do not match"
- The constructor arguments don't match what was deployed
- Verify all contract addresses in `.env` are correct

### Error: "Already Verified"
- This is not an error — the script handles this gracefully
- The contract is already verified on the block explorer

### Error: "Invalid API key"
- Set `ETHERSCAN_API_KEY` in `.env`
- Get API key from Etherscan/Basescan

## Notes

- The script uses the Solidity compiler version `0.8.26` with optimizer enabled (200 runs)
- Standard OpenZeppelin contracts are automatically handled
- If any contract address is missing, it's skipped with a warning
