-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "address" TEXT NOT NULL,
    "kycStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "balanceUSD" REAL NOT NULL DEFAULT 0.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PerpetualPosition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "posId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "leverage" INTEGER NOT NULL,
    "marginAmount" REAL NOT NULL,
    "size" REAL NOT NULL,
    "isLong" BOOLEAN NOT NULL,
    "isCross" BOOLEAN NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "entryPrice" REAL NOT NULL,
    "pnl" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PerpetualPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LendingLoan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loanId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "borrowAsset" TEXT NOT NULL,
    "borrowAmount" REAL NOT NULL,
    "collateralAsset" TEXT NOT NULL,
    "collateralAmount" REAL NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LendingLoan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LeveragedSpot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "posId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "targetAsset" TEXT NOT NULL,
    "collateralAmount" REAL NOT NULL,
    "leverage" INTEGER NOT NULL,
    "size" REAL NOT NULL,
    "isLimit" BOOLEAN NOT NULL,
    "triggerPrice" REAL,
    "takeProfit" REAL,
    "stopLoss" REAL,
    "isPending" BOOLEAN NOT NULL DEFAULT false,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeveragedSpot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HiddenOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "commitment" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HiddenOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FundingHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "posId" INTEGER NOT NULL,
    "deduction" REAL NOT NULL,
    "indexAtApply" REAL NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_address_key" ON "User"("address");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_address_key" ON "Wallet"("address");

-- CreateIndex
CREATE UNIQUE INDEX "PerpetualPosition_posId_key" ON "PerpetualPosition"("posId");

-- CreateIndex
CREATE UNIQUE INDEX "LendingLoan_loanId_key" ON "LendingLoan"("loanId");

-- CreateIndex
CREATE UNIQUE INDEX "LeveragedSpot_posId_key" ON "LeveragedSpot"("posId");

-- CreateIndex
CREATE UNIQUE INDEX "HiddenOrder_orderId_key" ON "HiddenOrder"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "HiddenOrder_commitment_key" ON "HiddenOrder"("commitment");
