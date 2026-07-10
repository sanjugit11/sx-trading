const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("SX Trading Suite - Ecosystem Test Suite", function () {
    let owner, device1, device2, device3, user1, user2;
    let usdt, mockCollateralToken, oracle;
    let sxpt, sxlt, sxls, sxud, sxhop, sxadmin;

    beforeEach(async function () {
        [owner, device1, device2, device3, user1, user2] = await ethers.getSigners();

        // 1. Deploy Mock USDT
        const MockUSDT = await ethers.getContractFactory("MockUSDT");
        usdt = await MockUSDT.deploy();
        await usdt.waitForDeployment();

        // 2. Deploy Mock Collateral Token
        const MockCollateral = await ethers.getContractFactory("MockUSDT");
        mockCollateralToken = await MockCollateral.deploy();
        await mockCollateralToken.waitForDeployment();

        // 3. Deploy Mock Oracle
        const MockOracle = await ethers.getContractFactory("MockOracle");
        oracle = await MockOracle.deploy();
        await oracle.waitForDeployment();

        // Set initial Oracle prices (8 decimals, e.g. Collateral = $10, USDT = $1)
        await oracle.setPrice(await mockCollateralToken.getAddress(), 10 * 10 ** 8);
        await oracle.setPrice(await usdt.getAddress(), 1 * 10 ** 8);

        // 4. Deploy SXPT (Perpetual Trading)
        const SXPT = await ethers.getContractFactory("SXPT");
        sxpt = await SXPT.deploy(await usdt.getAddress(), await oracle.getAddress());
        await sxpt.waitForDeployment();

        // 5. Deploy SXLT (Asset Lending)
        const SXLT = await ethers.getContractFactory("SXLT");
        sxlt = await SXLT.deploy(await oracle.getAddress());
        await sxlt.waitForDeployment();

        // 6. Deploy SXLS (Leveraged Spot)
        const SXLS = await ethers.getContractFactory("SXLS");
        sxls = await SXLS.deploy(await usdt.getAddress(), await oracle.getAddress());
        await sxls.waitForDeployment();

        // 7. Deploy SXUD (Unified Dashboard)
        const SXUD = await ethers.getContractFactory("SXUD");
        sxud = await SXUD.deploy(
            await sxpt.getAddress(),
            await sxlt.getAddress(),
            await sxls.getAddress(),
            await oracle.getAddress()
        );
        await sxud.waitForDeployment();

        // 8. Deploy SXHOP (Hidden Orders)
        const SXHOP = await ethers.getContractFactory("SXHOP");
        sxhop = await SXHOP.deploy(await sxls.getAddress(), await usdt.getAddress());
        await sxhop.waitForDeployment();

        // 9. Deploy SXAdmin (MultiSig Admin)
        const SXAdmin = await ethers.getContractFactory("SXAdmin");
        sxadmin = await SXAdmin.deploy(
            device1.address,
            device2.address,
            device3.address,
            await sxpt.getAddress(),
            await sxlt.getAddress(),
            await sxls.getAddress()
        );
        await sxadmin.waitForDeployment();

        // Transfer ownership of target contracts to SXAdmin so it can pause/control them
        await sxpt.transferOwnership(await sxadmin.getAddress());
        await sxlt.transferOwnership(await sxadmin.getAddress());
        await sxls.transferOwnership(await sxadmin.getAddress());

        // Mint and approve tokens for users
        const mintAmount = ethers.parseEther("100000"); // 100,000 tokens
        await usdt.mint(user1.address, mintAmount);
        await usdt.mint(user2.address, mintAmount);
        await mockCollateralToken.mint(user1.address, mintAmount);
        await mockCollateralToken.mint(user2.address, mintAmount);

        // Approve USDT and MockCollateral to contracts
        await usdt.connect(user1).approve(await sxpt.getAddress(), mintAmount);
        await usdt.connect(user1).approve(await sxlt.getAddress(), mintAmount);
        await usdt.connect(user1).approve(await sxls.getAddress(), mintAmount);
        await usdt.connect(user1).approve(await sxhop.getAddress(), mintAmount);
        await mockCollateralToken.connect(user1).approve(await sxlt.getAddress(), mintAmount);

        await usdt.connect(user2).approve(await sxpt.getAddress(), mintAmount);
        await usdt.connect(user2).approve(await sxlt.getAddress(), mintAmount);
        await usdt.connect(user2).approve(await sxls.getAddress(), mintAmount);
        await usdt.connect(user2).approve(await sxhop.getAddress(), mintAmount);
        await mockCollateralToken.connect(user2).approve(await sxlt.getAddress(), mintAmount);
    });

    describe("1. Perpetual Trading (SXPT)", function () {
        it("should open and close long/short positions with leverage", async function () {
            const margin = ethers.parseEther("100");
            const leverage = 10n;

            await expect(sxpt.connect(user1).openPerpetualPosition(
                await mockCollateralToken.getAddress(),
                leverage,
                margin,
                true, // Long
                false // Isolated
            )).to.emit(sxpt, "PerpetualPositionOpened");

            const details = await sxpt.positions(1);
            expect(details.isOpen).to.be.true;
            expect(details.size).to.equal(margin * leverage);

            // Close position at same price (no PnL change)
            await expect(sxpt.connect(user1).closePerpetualPosition(1))
                .to.emit(sxpt, "PerpetualPositionClosed");
        });

        it("should reject invalid leverage levels", async function () {
            const margin = ethers.parseEther("100");
            await expect(sxpt.connect(user1).openPerpetualPosition(
                await mockCollateralToken.getAddress(),
                1n, // too low
                margin,
                true,
                false
            )).to.be.revertedWith("SXPT: leverage out of range");

            await expect(sxpt.connect(user1).openPerpetualPosition(
                await mockCollateralToken.getAddress(),
                2000n, // too high
                margin,
                true,
                false
            )).to.be.revertedWith("SXPT: leverage out of range");
        });

        it("should apply funding rates based on long/short open interest skew", async function () {
            const margin = ethers.parseEther("100");
            const asset = await mockCollateralToken.getAddress();

            // Open Long
            await sxpt.connect(user1).openPerpetualPosition(asset, 10n, margin, true, false);
            // Open Short (smaller size, creates skew)
            await sxpt.connect(user2).openPerpetualPosition(asset, 5n, margin, false, false);

            // Skew is positive (longs > shorts), so funding rate should be positive
            const rate = await sxpt.getFundingRate(asset);
            expect(rate).to.be.greaterThan(0n);

            // Fast forward time to accrue funding
            await time.increase(3600); // 1 hour

            // Apply funding deduction on position 1
            await expect(sxpt.connect(user1).applyFundingDeduction(1))
                .to.emit(sxpt, "FundingRateApplied");

            const detailsAfter = await sxpt.positions(1);
            // Margin should be lower than initial deposit due to paying funding
            expect(detailsAfter.marginAmount).to.be.lessThan(margin);
        });

        it("should enforce protection (no liquidation, capped loss) on positions", async function () {
            const margin = ethers.parseEther("10");
            const asset = await mockCollateralToken.getAddress();

            await sxpt.connect(user1).openPerpetualPosition(asset, 100n, margin, true, false); // 100x leverage

            // Set oracle price to crash (representing >100% loss)
            // Initial Price of collateral = $10, drop to $5 (50% drop at 100x = 5000% loss)
            await oracle.setPrice(asset, 5 * 10 ** 8);

            // Close the position
            // Even though the loss exceeds margin, the payout is protected (payout = 0, no deficit)
            const tx = await sxpt.connect(user1).closePerpetualPosition(1);
            const receipt = await tx.wait();
            const closedEvent = receipt.logs
                .map(log => sxpt.interface.parseLog(log))
                .find(event => event && event.name === "PerpetualPositionClosed");

            expect(closedEvent.args.payoutAmount).to.equal(0n);
        });
    });

    describe("2. Asset Lending (SXLT)", function () {
        it("should lend assets, borrow against collateral within 250% LTV, and repay loans", async function () {
            const lendAmount = ethers.parseEther("5000");
            const borrowAmount = ethers.parseEther("100");
            const collateralAmount = ethers.parseEther("50"); // 50 collateral * $10 = $500 value (500% LTV, >=250% allowed)

            const usdtAddr = await usdt.getAddress();
            const colAddr = await mockCollateralToken.getAddress();

            // Lend USDT
            await expect(sxlt.connect(user1).lendAssets(usdtAddr, lendAmount))
                .to.emit(sxlt, "AssetLent");

            // Borrow USDT using collateral
            await expect(sxlt.connect(user2).borrowAssets(usdtAddr, borrowAmount, colAddr, collateralAmount))
                .to.emit(sxlt, "LoanCreated");

            // Verify pool rates
            const interestRate = await sxlt.getInterestRate(usdtAddr);
            expect(interestRate).to.be.greaterThan(0n);

            const yieldRate = await sxlt.getLendingYield(usdtAddr);
            expect(yieldRate).to.be.greaterThan(0n);

            // Repay loan immediately (negligible interest)
            await expect(sxlt.connect(user2).repayLoan(1, borrowAmount))
                .to.emit(sxlt, "LoanRepaid");
        });

        it("should reject borrows violating the 250% LTV requirement", async function () {
            const lendAmount = ethers.parseEther("5000");
            const borrowAmount = ethers.parseEther("201"); // $201 worth
            const collateralAmount = ethers.parseEther("50"); // 50 * $10 = $500 collateral (LTV ratio = 500 / 201 = 2.48, i.e. < 250%)

            const usdtAddr = await usdt.getAddress();
            const colAddr = await mockCollateralToken.getAddress();

            await sxlt.connect(user1).lendAssets(usdtAddr, lendAmount);

            await expect(sxlt.connect(user2).borrowAssets(usdtAddr, borrowAmount, colAddr, collateralAmount))
                .to.be.revertedWith("SXLT: insufficient collateral for 250% LTV");
        });
    });

    describe("3. Leveraged Spot Trading (SXLS)", function () {
        it("should open immediately for market order, update TP/SL, and trigger TP/SL limits", async function () {
            const collateral = ethers.parseEther("100");
            const asset = await mockCollateralToken.getAddress();

            // Open market order
            await expect(sxls.connect(user1).openLeveragedSpot(asset, collateral, 3n, false, 0))
                .to.emit(sxls, "LeveragedSpotOpened");

            // Update TP and SL targets
            await expect(sxls.connect(user1).updateTakeProfit(1, 15 * 10 ** 8))
                .to.emit(sxls, "TakeProfitUpdated");

            await expect(sxls.connect(user1).updateStopLoss(1, 8 * 10 ** 8))
                .to.emit(sxls, "StopLossUpdated");

            // Verify PnL is correct
            const pnlInfo = await sxls.getPositionPnL(1);
            expect(pnlInfo.pnl).to.equal(0n);

            // Oracle price rises to TP target ($15)
            await oracle.setPrice(asset, 15 * 10 ** 8);

            // Public execution of TP trigger (since owner != position creator, allowed when TP is hit)
            await expect(sxls.connect(user2).closeLeveragedSpot(1))
                .to.emit(sxls, "LeveragedSpotClosed");
        });

        it("should execute limit order only when price falls below trigger price", async function () {
            const collateral = ethers.parseEther("100");
            const asset = await mockCollateralToken.getAddress();

            // Trigger price = $8. Current price = $10. Limit order remains pending.
            await sxls.connect(user1).openLeveragedSpot(asset, collateral, 3n, true, 8 * 10 ** 8);

            const detailsPending = await sxls.positions(1);
            expect(detailsPending.isPending).to.be.true;

            // Attempting to execute when price is still $10 should revert
            await expect(sxls.checkAndExecuteLimitOrder(1))
                .to.be.revertedWith("SXLS: price still above trigger");

            // Update Oracle price to $8
            await oracle.setPrice(asset, 8 * 10 ** 8);

            // Execute limit order
            await expect(sxls.checkAndExecuteLimitOrder(1))
                .to.emit(sxls, "LimitOrderExecuted");

            const detailsActive = await sxls.positions(1);
            expect(detailsActive.isPending).to.be.false;
        });
    });

    describe("4. Unified Dashboard (SXUD)", function () {
        it("should aggregate total exposures, collateral, and compute portfolio risk scores", async function () {
            const asset = await mockCollateralToken.getAddress();
            const usdtAddr = await usdt.getAddress();

            // 1. Open Perp Position (Exposure = $1000, Collateral = $100)
            await sxpt.connect(user1).openPerpetualPosition(asset, 10n, ethers.parseEther("100"), true, false);

            // 2. Open Spot Position (Exposure = $300, Collateral = $100)
            await sxls.connect(user1).openLeveragedSpot(asset, ethers.parseEther("100"), 3n, false, 0);

            // 3. Open Loan (Borrow = $100, Collateral = $50 * $10 = $500)
            await sxlt.connect(user2).lendAssets(usdtAddr, ethers.parseEther("5000"));
            await sxlt.connect(user1).borrowAssets(usdtAddr, ethers.parseEther("100"), asset, ethers.parseEther("50"));

            // Calculate aggregated metrics
            const totalExposure = await sxud.getTotalExposure(user1.address);
            // Expected exposure = 1000 (perp size) + 300 (spot size) + 100 (loan borrow) = 1400 USD
            expect(totalExposure).to.equal(ethers.parseEther("1400"));

            const totalCollateral = await sxud.getCrossTerminalCollateral(user1.address);
            // Expected collateral = 100 (perp margin) + 100 (spot collateral) + 500 (lending collateral) = 700 USD
            expect(totalCollateral).to.equal(ethers.parseEther("700"));

            const riskScore = await sxud.getUnifiedRiskScore(user1.address);
            // Risk score = (1400 * 100) / 700 = 200%, capped at 100%
            expect(riskScore).to.equal(100n);

            const allPos = await sxud.getAllPositions(user1.address);
            expect(allPos.perps.length).to.equal(1);
            expect(allPos.loans.length).to.equal(1);
            expect(allPos.spots.length).to.equal(1);
        });
    });

    describe("5. Hidden Orders (SXHOP)", function () {
        it("should place and execute private orders via commitment-reveal validation", async function () {
            const asset = await mockCollateralToken.getAddress();
            const collateral = ethers.parseEther("100");
            const leverage = 3n;
            const orderType = 0; // HOBL
            const price = 10n * 10n**8n;
            const salt = 12345n;

            // Generate commitment: user, targetAsset, collateralAmount, leverage, orderType, price, salt
            const hash = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "address", "uint256", "uint256", "uint8", "uint256", "uint256"],
                    [user1.address, asset, collateral, leverage, orderType, price, salt]
                )
            );

            // Mock ZK proof (non-empty bytes array)
            const proof = ethers.hexlify(ethers.randomBytes(64));

            // Place hidden order
            await expect(sxhop.connect(user1).placeHiddenOrder(hash, proof))
                .to.emit(sxhop, "HiddenOrderPlaced");

            // Approve Hidden Order Contract to spend user's USDT (required for execution)
            await usdt.connect(user1).approve(await sxhop.getAddress(), collateral);

            // Execute Hidden Order with parameters revealed
            const executionDetails = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "address", "uint256", "uint256", "uint8", "uint256", "uint256"],
                [user1.address, asset, collateral, leverage, orderType, price, salt]
            );

            await expect(sxhop.connect(user2).executeHiddenOrder(1, executionDetails, proof))
                .to.emit(sxhop, "HiddenOrderExecuted");

            // Verify order status is Executed (1)
            const status = await sxhop.getOrderStatus(1);
            expect(status).to.equal(1); // Executed
        });
    });

    describe("6. MultiSig Administration (SXAdmin)", function () {
        it("should perform 3/3 MultiSig proposals to pause and resume target contracts", async function () {
            // Target: sxadmin contract itself to activate kill switch
            const data = sxadmin.interface.encodeFunctionData("activateKillSwitch");

            // 1. Create Proposal
            await expect(sxadmin.connect(device1).createProposal(await sxadmin.getAddress(), data))
                .to.emit(sxadmin, "ProposalCreated");

            // 2. Approve Proposal
            await expect(sxadmin.connect(device1).approveProposal(1)).to.emit(sxadmin, "ProposalApproved");
            await expect(sxadmin.connect(device2).approveProposal(1)).to.emit(sxadmin, "ProposalApproved");
            await expect(sxadmin.connect(device3).approveProposal(1)).to.emit(sxadmin, "ProposalApproved");

            // 3. Execute Proposal (Triggering pauses across all contracts)
            await expect(sxadmin.connect(device1).executeProposal(1))
                .to.emit(sxadmin, "ProposalExecuted")
                .to.emit(sxadmin, "KillSwitchActivated");

            // Contracts must be paused
            expect(await sxpt.paused()).to.be.true;
            expect(await sxlt.paused()).to.be.true;
            expect(await sxls.paused()).to.be.true;

            // 4. Create Proposal to resume
            const dataDeactivate = sxadmin.interface.encodeFunctionData("deactivateKillSwitch");
            await sxadmin.connect(device1).createProposal(await sxadmin.getAddress(), dataDeactivate);

            // Approve with 3/3
            await sxadmin.connect(device1).approveProposal(2);
            await sxadmin.connect(device2).approveProposal(2);
            await sxadmin.connect(device3).approveProposal(2);

            // Execute resume proposal
            await expect(sxadmin.connect(device1).executeProposal(2))
                .to.emit(sxadmin, "ProposalExecuted")
                .to.emit(sxadmin, "KillSwitchDeactivated");

            // Contracts must be unpaused
            expect(await sxpt.paused()).to.be.false;
            expect(await sxlt.paused()).to.be.false;
            expect(await sxls.paused()).to.be.false;
        });

        it("should reject unauthorized device calls", async function () {
            const data = sxadmin.interface.encodeFunctionData("activateKillSwitch");
            await expect(sxadmin.connect(user1).createProposal(await sxadmin.getAddress(), data))
                .to.be.revertedWith("SXAdmin: only master device");
        });
    });
});
