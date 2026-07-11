const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("SXPT - Perpetual Contract Rule Verification Suite", function () {
    let owner, user1, user2, admin;
    let usdt, oracle, sxpt;
    let asset;

    beforeEach(async function () {
        [owner, user1, user2, admin] = await ethers.getSigners();

        // Deploy Mock USDT
        const MockUSDT = await ethers.getContractFactory("MockUSDT");
        usdt = await MockUSDT.deploy();
        await usdt.waitForDeployment();

        // Deploy Mock Oracle
        const MockOracle = await ethers.getContractFactory("MockOracle");
        oracle = await MockOracle.deploy();
        await oracle.waitForDeployment();

        // Set initial Oracle price
        asset = await MockUSDT.deploy(); // Use another ERC20 as asset
        await asset.waitForDeployment();
        await oracle.setPrice(await asset.getAddress(), 10 * 10 ** 8); // $10

        // Deploy SXPT
        const SXPT = await ethers.getContractFactory("SXPT");
        sxpt = await SXPT.deploy(await usdt.getAddress(), await oracle.getAddress());
        await sxpt.waitForDeployment();

        // Mint and approve USDT for users
        const mintAmount = ethers.parseEther("100000");
        await usdt.mint(user1.address, mintAmount);
        await usdt.mint(user2.address, mintAmount);
        await usdt.connect(user1).approve(await sxpt.getAddress(), mintAmount);
        await usdt.connect(user2).approve(await sxpt.getAddress(), mintAmount);
    });

    describe("Rule 1: Leverage <= MAX_LEVERAGE", function () {
        it("should allow opening positions with leverage equal to MAX_LEVERAGE", async function () {
            const maxLeverage = await sxpt.MAX_LEVERAGE();
            const margin = ethers.parseEther("100");

            await expect(sxpt.connect(user1).openPerpetualPosition(
                await asset.getAddress(),
                maxLeverage,
                margin,
                true,
                false
            )).to.emit(sxpt, "PerpetualPositionOpened");

            const details = await sxpt.positions(1);
            expect(details.leverage).to.equal(maxLeverage);
        });

        it("should revert when attempting to open a position with leverage greater than MAX_LEVERAGE", async function () {
            const maxLeverage = await sxpt.MAX_LEVERAGE();
            const margin = ethers.parseEther("100");

            await expect(sxpt.connect(user1).openPerpetualPosition(
                await asset.getAddress(),
                maxLeverage + 1n,
                margin,
                true,
                false
            )).to.be.revertedWith("SXPT: leverage out of range");
        });

        it("should revert when leverage is below minimum (less than 2)", async function () {
            const margin = ethers.parseEther("100");
            await expect(sxpt.connect(user1).openPerpetualPosition(
                await asset.getAddress(),
                1n,
                margin,
                true,
                false
            )).to.be.revertedWith("SXPT: leverage out of range");
        });
    });

    describe("Rule 2: Closed positions cannot be reopened", function () {
        beforeEach(async function () {
            // Open a position
            const margin = ethers.parseEther("100");
            await sxpt.connect(user1).openPerpetualPosition(
                await asset.getAddress(),
                10n,
                margin,
                true,
                false
            );
        });

        it("should close an open position and mark isOpen as false", async function () {
            const posId = 1;
            await expect(sxpt.connect(user1).closePerpetualPosition(posId))
                .to.emit(sxpt, "PerpetualPositionClosed");

            const details = await sxpt.positions(posId);
            expect(details.isOpen).to.be.false;
        });

        it("should revert when trying to close a position that is already closed", async function () {
            const posId = 1;
            await sxpt.connect(user1).closePerpetualPosition(posId);

            // Closing again should fail
            await expect(sxpt.connect(user1).closePerpetualPosition(posId))
                .to.be.revertedWith("SXPT: position not open");
        });

        it("should not allow applying funding deductions to a closed position", async function () {
            const posId = 1;
            await sxpt.connect(user1).closePerpetualPosition(posId);

            await expect(sxpt.connect(user1).applyFundingDeduction(posId))
                .to.be.revertedWith("SXPT: position closed");
        });
    });

    describe("Rule 3: Funding fee cannot exceed margin", function () {
        it("should cap the funding deduction at the margin amount (margin never goes below 0 or wraps)", async function () {
            const margin = ethers.parseEther("10"); // small margin
            const assetAddress = await asset.getAddress();

            // 1. Open Long (user1) and Short (user2 - smaller size) to create massive skew
            await sxpt.connect(user1).openPerpetualPosition(assetAddress, 100n, margin, true, false); // Long size = 1000
            await sxpt.connect(user2).openPerpetualPosition(assetAddress, 2n, margin, false, false);   // Short size = 20

            // 2. Skew is heavily positive, longs will pay funding.
            const rate = await sxpt.getFundingRate(assetAddress);
            expect(rate).to.be.greaterThan(0n);

            // 3. Advance time by many hours to accrue extremely high funding fee that exceeds margin
            // Accrued funding = size (1000) * cumulativeFundingIndex
            await time.increase(3600 * 24 * 10); // 10 days

            // 4. Apply funding deduction. The funding fee should exceed the margin, but the margin must be capped at 0.
            await expect(sxpt.connect(user1).applyFundingDeduction(1))
                .to.emit(sxpt, "FundingRateApplied");

            const details = await sxpt.positions(1);
            expect(details.marginAmount).to.equal(0n); // Capped at 0, no wrap/underflow
        });

        it("should properly credit margin when funding deduction is negative (longs receive funding)", async function () {
            const margin = ethers.parseEther("100");
            const assetAddress = await asset.getAddress();

            // Open Long (user1 - smaller size) and Short (user2 - larger size) to make skew negative
            await sxpt.connect(user1).openPerpetualPosition(assetAddress, 2n, margin, true, false);   // Long size = 200
            await sxpt.connect(user2).openPerpetualPosition(assetAddress, 10n, margin, false, false); // Short size = 1000

            // Skew is negative, longs receive funding
            const rate = await sxpt.getFundingRate(assetAddress);
            expect(rate).to.be.lessThan(0n);

            await time.increase(3600); // 1 hour

            await expect(sxpt.connect(user1).applyFundingDeduction(1))
                .to.emit(sxpt, "FundingRateApplied");

            const details = await sxpt.positions(1);
            expect(details.marginAmount).to.be.greaterThan(margin); // Received funding successfully
        });
    });

    describe("Rule 4: Only admin can pause contract", function () {
        it("should allow the owner/admin to pause and unpause the contract", async function () {
            expect(await sxpt.paused()).to.be.false;

            // Pause
            await expect(sxpt.connect(owner).setPaused(true))
                .to.emit(sxpt, "SystemPaused")
                .withArgs(true);
            expect(await sxpt.paused()).to.be.true;

            // Unpause
            await expect(sxpt.connect(owner).setPaused(false))
                .to.emit(sxpt, "SystemPaused")
                .withArgs(false);
            expect(await sxpt.paused()).to.be.false;
        });

        it("should revert when a non-owner/non-admin attempts to pause the contract", async function () {
            await expect(sxpt.connect(user1).setPaused(true))
                .to.be.revertedWithCustomError(sxpt, "OwnableUnauthorizedAccount")
                .withArgs(user1.address);
            
            expect(await sxpt.paused()).to.be.false;
        });

        it("should prevent opening new positions when paused", async function () {
            await sxpt.connect(owner).setPaused(true);

            const margin = ethers.parseEther("100");
            await expect(sxpt.connect(user1).openPerpetualPosition(
                await asset.getAddress(),
                10n,
                margin,
                true,
                false
            )).to.be.revertedWith("SXPT: system paused");
        });
    });
});
