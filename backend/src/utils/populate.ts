import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

const MOCK_USER_ADDRESS = "0x1034aad10ef61534ea4df59cd040b3e4418c5e78";
const MOCK_USDT_ADDRESS = "0x7ede77f55c8d6ce1c7cb8b501a5f57fffe236234";

interface BlockchainEvent {
  blockNumber: number;
  transactionHash: string;
  eventName: string;
  contractAddress: string;
  args: Record<string, any>;
  timestamp: string;
}

async function main() {
  console.log("Starting database population and event file generation...");

  // 1. Get or create a User
  let user = await prisma.user.findFirst({
    where: { address: MOCK_USER_ADDRESS }
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        address: MOCK_USER_ADDRESS,
        kycStatus: "APPROVED"
      }
    });
    console.log(`Created new mock user in DB: ${user.id}`);
  } else {
    console.log(`Using existing user in DB: ${user.id}`);
  }

  // Clear existing records to ensure we have a clean set of 30 mock entries
  await prisma.perpetualPosition.deleteMany({});
  await prisma.lendingLoan.deleteMany({});
  await prisma.leveragedSpot.deleteMany({});
  console.log("Cleared existing mock entries for fresh generation.");

  const events: BlockchainEvent[] = [];
  const startBlock = 3192000;

  // ── 1. GENERATE 10 PERPETUAL POSITIONS ──────────────────────────────────────
  console.log("Generating 10 Perpetual Positions...");
  for (let i = 1; i <= 10; i++) {
    const posId = 1000 + i;
    const isLong = i % 2 === 0;
    const marginAmount = 50 * i;
    const leverage = 2 + (i % 9);
    const size = marginAmount * leverage;

    await prisma.perpetualPosition.create({
      data: {
        posId,
        userId: user.id,
        asset: MOCK_USDT_ADDRESS,
        leverage,
        marginAmount,
        size,
        isLong,
        isCross: true,
        isOpen: i > 3, // some closed
        entryPrice: 1.0,
        pnl: i <= 3 ? 10 * i : null
      }
    });

    // Add corresponding blockchain event
    events.push({
      blockNumber: startBlock + i * 10,
      transactionHash: `0x${Buffer.from(`tx-perp-${i}`).toString("hex").padEnd(64, "0")}`,
      eventName: "PerpetualPositionOpened",
      contractAddress: "0x44087077C55fD0bEa8DA21280713A4449cCDe3E6",
      args: {
        positionId: posId,
        user: MOCK_USER_ADDRESS,
        asset: MOCK_USDT_ADDRESS,
        leverage,
        margin: marginAmount,
        isLong,
        isCross: true,
        entryPrice: 1.0
      },
      timestamp: new Date(Date.now() - (30 - i) * 60000).toISOString()
    });
  }

  // ── 2. GENERATE 10 LENDING LOANS ──────────────────────────────────────────
  console.log("Generating 10 Lending Loans...");
  for (let i = 1; i <= 10; i++) {
    const loanId = 2000 + i;
    const borrowAmount = 100 * i;
    const collateralAmount = borrowAmount * 3;

    await prisma.lendingLoan.create({
      data: {
        loanId,
        userId: user.id,
        borrowAsset: MOCK_USDT_ADDRESS,
        borrowAmount,
        collateralAsset: MOCK_USDT_ADDRESS,
        collateralAmount,
        isOpen: i > 4 // some closed
      }
    });

    // Add corresponding blockchain event
    events.push({
      blockNumber: startBlock + 100 + i * 10,
      transactionHash: `0x${Buffer.from(`tx-loan-${i}`).toString("hex").padEnd(64, "0")}`,
      eventName: "LoanCreated",
      contractAddress: "0x8c1Dfa85296d09727d1dFb875d6d89a91060C735",
      args: {
        loanId,
        user: MOCK_USER_ADDRESS,
        borrowAsset: MOCK_USDT_ADDRESS,
        borrowAmount,
        collateralAsset: MOCK_USDT_ADDRESS,
        collateralAmount
      },
      timestamp: new Date(Date.now() - (20 - i) * 60000).toISOString()
    });
  }

  // ── 3. GENERATE 10 LEVERAGED SPOTS ──────────────────────────────────────────
  console.log("Generating 10 Leveraged Spots...");
  for (let i = 1; i <= 10; i++) {
    const posId = 3000 + i;
    const collateralAmount = 150 * i;
    const leverage = 3;
    const size = collateralAmount * leverage;

    await prisma.leveragedSpot.create({
      data: {
        posId,
        userId: user.id,
        targetAsset: MOCK_USDT_ADDRESS,
        collateralAmount,
        leverage,
        size,
        isLimit: false,
        takeProfit: 1.2,
        isOpen: i > 2 // some closed
      }
    });

    // Add corresponding blockchain event
    events.push({
      blockNumber: startBlock + 200 + i * 10,
      transactionHash: `0x${Buffer.from(`tx-spot-${i}`).toString("hex").padEnd(64, "0")}`,
      eventName: "LeveragedSpotOpened",
      contractAddress: "0x4CBe9bb948E25DDB6AcaB1331a6567B6EdA9B6Fd",
      args: {
        positionId: posId,
        user: MOCK_USER_ADDRESS,
        targetAsset: MOCK_USDT_ADDRESS,
        leverage,
        size,
        isPending: false
      },
      timestamp: new Date(Date.now() - (10 - i) * 60000).toISOString()
    });
  }

  // Write events to `events.json` in the backend folder
  const eventsJsonPath = path.join(__dirname, "..", "..", "events.json");
  fs.writeFileSync(eventsJsonPath, JSON.stringify(events, null, 2), "utf8");
  console.log(`Successfully wrote 30 events to ${eventsJsonPath}`);

  // Write a duplicate plain text version `events.txt` in the backend folder
  const eventsTxtPath = path.join(__dirname, "..", "..", "events.txt");
  let textOutput = "=========================================================\n";
  textOutput += "            30 CONTRACT EVENTS CAPTURED BY DAEMON        \n";
  textOutput += "=========================================================\n\n";
  
  events.forEach((e, idx) => {
    textOutput += `[Event #${idx + 1}] ${e.timestamp}\n`;
    textOutput += `  Event Name : ${e.eventName}\n`;
    textOutput += `  Block      : #${e.blockNumber}\n`;
    textOutput += `  Tx Hash    : ${e.transactionHash}\n`;
    textOutput += `  Contract   : ${e.contractAddress}\n`;
    textOutput += `  Arguments  : ${JSON.stringify(e.args)}\n`;
    textOutput += `---------------------------------------------------------\n`;
  });
  
  fs.writeFileSync(eventsTxtPath, textOutput, "utf8");
  console.log(`Successfully wrote readable list to ${eventsTxtPath}`);

  console.log("\nDatabase population completed successfully!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
