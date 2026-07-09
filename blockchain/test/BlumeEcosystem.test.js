const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Blume Token Ecosystem Auditing Tests", function () {
  let BLXToken, stBLXToken, BlumeStaking, BlumeVault, BlumeLP, MockUSDT, MockOracle;
  let blx, stBlx, staking, vault, lp, usdt, oracle;
  let owner, user1, user2, treasury;

  beforeEach(async function () {
    [owner, user1, user2, treasury] = await ethers.getSigners();

    // 1. Deploy BLX
    BLXToken = await ethers.getContractFactory("BLXToken");
    blx = await BLXToken.deploy();
    await blx.waitForDeployment();

    // 2. Deploy stBLX
    stBLXToken = await ethers.getContractFactory("stBLXToken");
    stBlx = await stBLXToken.deploy();
    await stBlx.waitForDeployment();

    // 3. Deploy Staking
    BlumeStaking = await ethers.getContractFactory("BlumeStaking");
    staking = await BlumeStaking.deploy(await blx.getAddress(), await stBlx.getAddress());
    await staking.waitForDeployment();

    // Wire permissions
    await stBlx.transferOwnership(await staking.getAddress());
    await blx.addMinter(await staking.getAddress());

    // 4. Deploy MockUSDT
    MockUSDT = await ethers.getContractFactory("MockUSDT");
    usdt = await MockUSDT.deploy();
    await usdt.waitForDeployment();

    // 5. Deploy MockOracle (1 BLX = 0.50 USDT. Decimals = 6. Price scaled = 500000)
    MockOracle = await ethers.getContractFactory("MockOracle");
    oracle = await MockOracle.deploy(500000, 6, "BLX / USDT price feed");
    await oracle.waitForDeployment();

    // 6. Deploy BlumeLP (with MockOracle Address)
    BlumeLP = await ethers.getContractFactory("BlumeLP");
    lp = await BlumeLP.deploy(await blx.getAddress(), await usdt.getAddress(), await oracle.getAddress());
    await lp.waitForDeployment();

    // 7. Deploy BlumeVault (with Staking contract & Treasury Address)
    BlumeVault = await ethers.getContractFactory("BlumeVault");
    vault = await BlumeVault.deploy(await blx.getAddress(), await staking.getAddress(), treasury.address);
    await vault.waitForDeployment();

    // Exclude users/pools from limits where necessary for setup
    await blx.setExcludeFromLimits(await staking.getAddress(), true);
    await blx.setExcludeFromLimits(await lp.getAddress(), true);
    await blx.setExcludeFromLimits(await vault.getAddress(), true);

    // Distribute BLX and USDT to test wallets
    const fundAmountBLX = ethers.parseEther("20000"); // 20k BLX
    const fundAmountUSDT = ethers.parseUnits("10000", 6); // 10k USDT

    await blx.transfer(user1.address, fundAmountBLX);
    await blx.transfer(user2.address, fundAmountBLX);
    await usdt.transfer(user1.address, fundAmountUSDT);
    await usdt.transfer(user2.address, fundAmountUSDT);
  });

  describe("BLX Token Anti-Whale Controls", function () {
    it("Should enforce maxTxAmount limit transfer caps on standard users", async function () {
      const whaleTxAmount = ethers.parseEther("11000000"); // 11 million (Limit is 10 million)
      
      // Transfer to user2 should fail if exceeds 10M cap
      await blx.transfer(user1.address, whaleTxAmount); // Owner is exempt from limit, transfer succeeds

      await expect(
        blx.connect(user1).transfer(user2.address, whaleTxAmount)
      ).to.be.revertedWith("BLX: Transfer amount exceeds maxTxAmount limit");
    });

    it("Should enforce maxWalletLimit caps", async function () {
      await blx.updateLimits(ethers.parseEther("25000000"), ethers.parseEther("20000000"));
      await blx.transfer(user1.address, ethers.parseEther("21000000"));
      
      // Should fail if a non-exempt transfer takes recipient wallet above 20 million.
      await expect(
        blx.connect(user1).transfer(user2.address, ethers.parseEther("20000001"))
      ).to.be.revertedWith("BLX: Target wallet balance exceeds maxWalletLimit");
    });
  });

  describe("Classic Staking Early Withdrawal Penalty", function () {
    it("Should deduct a 15% penalty fee and forfeit rewards if unstaked early", async function () {
      const stakeAmt = ethers.parseEther("1000");
      await blx.connect(user1).approve(await staking.getAddress(), stakeAmt);
      
      // Index 1 represents 30 Days locking stake
      await staking.connect(user1).stakeClassic(stakeAmt, 1);

      // Fast forward time slightly (1 day, stake unlock is 30 days)
      await ethers.provider.send("evm_increaseTime", [24 * 3600]);
      await ethers.provider.send("evm_mine");

      const balBefore = await blx.balanceOf(user1.address);
      const ownerBalBefore = await blx.balanceOf(owner.address);

      // Perform early exit (should succeed but charge penalty)
      await expect(staking.connect(user1).unstakeClassic(0)).to.emit(staking, "ClassicUnstaked");

      const balAfter = await blx.balanceOf(user1.address);
      const ownerBalAfter = await blx.balanceOf(owner.address);

      const penaltyAmt = (stakeAmt * 1500n) / 10000n; // 15%
      const principalReturned = stakeAmt - penaltyAmt;

      expect(balAfter - balBefore).to.equal(principalReturned);
      expect(ownerBalAfter - ownerBalBefore).to.equal(penaltyAmt); // Penalty sent to owner
    });
  });

  describe("Liquidity Pool Oracle Protections", function () {
    it("Should block swaps if reserves deviate too much from Oracle price feed", async function () {
      // Add initial liquidity
      const blxAdd = ethers.parseEther("5000");
      const usdtAdd = ethers.parseUnits("2500", 6); // 2:1 ratio ($0.50 price)
      
      await blx.connect(user1).approve(await lp.getAddress(), blxAdd);
      await usdt.connect(user1).approve(await lp.getAddress(), usdtAdd);
      await lp.connect(user1).addLiquidity(blxAdd, usdtAdd);

      // Oracle price matches spot: 500000 (0.50)
      await lp.validatePriceWithOracle(); // Should succeed

      // Simulate a manipulation attack by updating the oracle price to 1.00 USDT (100% difference)
      await oracle.setPrice(1000000); 

      // Attempting to swap should now revert due to deviation
      const usdtSwap = ethers.parseUnits("100", 6);
      await usdt.connect(user2).approve(await lp.getAddress(), usdtSwap);

      await expect(
        lp.connect(user2).swap(await usdt.getAddress(), usdtSwap, 0)
      ).to.be.revertedWith("LP: Spot ratio deviates too much from Price Oracle");
    });
  });

  describe("Advanced EIP-4626 Farming Vault", function () {
    it("Should auto-stake underlying assets and compound rewards", async function () {
      const depositAmt = ethers.parseEther("1000");
      await blx.connect(user1).approve(await vault.getAddress(), depositAmt);

      // Deposit
      await vault.connect(user1).deposit(depositAmt, user1.address);

      // Underlying BLX should be staked in BlumeStaking
      expect(await staking.totalClassicStaked()).to.equal(depositAmt);

      // Fast forward time to accrue rewards
      await ethers.provider.send("evm_increaseTime", [10 * 24 * 3600]); // 10 days
      await ethers.provider.send("evm_mine");

      // Verify compound function claims rewards and adds them to backing assets
      const totalAssetsBefore = await vault.totalAssets();
      await vault.compound();
      const totalAssetsAfter = await vault.totalAssets();

      expect(totalAssetsAfter).to.be.gt(totalAssetsBefore); // Yield compounded successfully!
    });

    it("Should succeed on repeated vault withdrawals without locking funds", async function () {
      const depositAmt = ethers.parseEther("1000");
      await blx.connect(user1).approve(await vault.getAddress(), depositAmt);
      await blx.connect(user2).approve(await vault.getAddress(), depositAmt);

      // Deposit from two different users
      await vault.connect(user1).deposit(depositAmt, user1.address);
      await vault.connect(user2).deposit(depositAmt, user2.address);

      // Fast forward time slightly
      await ethers.provider.send("evm_increaseTime", [1 * 24 * 3600]);
      await ethers.provider.send("evm_mine");

      // User1 withdraws 500 BLX
      const withdrawAmt = ethers.parseEther("500");
      const user1BalBefore = await blx.balanceOf(user1.address);
      await vault.connect(user1).withdraw(withdrawAmt, user1.address, user1.address);
      const user1BalAfter = await blx.balanceOf(user1.address);
      // expect user1 to receive 500 BLX (minus 0.5% fee = 497.5 BLX)
      expect(user1BalAfter - user1BalBefore).to.equal(ethers.parseEther("497.5"));

      // User2 withdraws 500 BLX
      const user2BalBefore = await blx.balanceOf(user2.address);
      await vault.connect(user2).withdraw(withdrawAmt, user2.address, user2.address);
      const user2BalAfter = await blx.balanceOf(user2.address);
      expect(user2BalAfter - user2BalBefore).to.equal(ethers.parseEther("497.5"));

      // User1 withdraws the remaining 500 BLX (shares/assets)
      const user1BalBefore2 = await blx.balanceOf(user1.address);
      await vault.connect(user1).withdraw(withdrawAmt, user1.address, user1.address);
      const user1BalAfter2 = await blx.balanceOf(user1.address);
      expect(user1BalAfter2 - user1BalBefore2).to.equal(ethers.parseEther("497.5"));
    });
  });
});
