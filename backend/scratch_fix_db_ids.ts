import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Update the three active positions to match their real on-chain sequential IDs
  await prisma.perpetualPosition.update({
    where: { id: "dd9f32ef-ac3a-4f25-bd90-fe542cef9d57" },
    data: { posId: 1 }
  });
  console.log("Updated dd9f32ef... to posId: 1");

  await prisma.perpetualPosition.update({
    where: { id: "7c226fa7-1f7c-4f09-abc3-c1958319221d" },
    data: { posId: 2 }
  });
  console.log("Updated 7c226fa7... to posId: 2");

  await prisma.perpetualPosition.update({
    where: { id: "53ae877c-5122-4df0-b521-645fc2fbc3fc" },
    data: { posId: 3 }
  });
  console.log("Updated 53ae877c... to posId: 3");

  // Optional: Set any other positions to isOpen: false so they don't clutter the UI
  await prisma.perpetualPosition.updateMany({
    where: {
      NOT: {
        id: {
          in: [
            "dd9f32ef-ac3a-4f25-bd90-fe542cef9d57",
            "7c226fa7-1f7c-4f09-abc3-c1958319221d",
            "53ae877c-5122-4df0-b521-645fc2fbc3fc"
          ]
        }
      }
    },
    data: { isOpen: false }
  });
  console.log("Closed old inactive positions in the DB.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
