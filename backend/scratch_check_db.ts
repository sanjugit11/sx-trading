import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const hiddenOrders = await prisma.hiddenOrder.findMany();
  console.log("All hidden orders in DB:", JSON.stringify(hiddenOrders, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
