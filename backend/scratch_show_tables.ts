import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const perps = await prisma.perpetualPosition.findMany();
  const loans = await prisma.lendingLoan.findMany();
  const spots = await prisma.leveragedSpot.findMany();

  console.log("=========================================================");
  console.log("              DATABASE POPULATION SUMMARY                ");
  console.log("=========================================================");
  console.log(`Total Perpetual Positions : ${perps.length}`);
  console.log(`Total Lending Loans       : ${loans.length}`);
  console.log(`Total Leveraged Spots     : ${spots.length}`);
  console.log("=========================================================\n");

  console.log("--- Perpetual Positions (First 3) ---");
  console.log(JSON.stringify(perps.slice(0, 3), null, 2));

  console.log("\n--- Lending Loans (First 3) ---");
  console.log(JSON.stringify(loans.slice(0, 3), null, 2));

  console.log("\n--- Leveraged Spots (First 3) ---");
  console.log(JSON.stringify(spots.slice(0, 3), null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
