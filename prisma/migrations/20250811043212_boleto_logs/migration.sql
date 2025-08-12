-- CreateEnum
CREATE TYPE "public"."RequestType" AS ENUM ('SINGLE', 'ALL', 'ALL_ENTERPRISES');

-- CreateTable
CREATE TABLE "public"."BoletoRequestLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cpf" TEXT NOT NULL,
    "customerName" TEXT,
    "requestType" "public"."RequestType" NOT NULL,
    "statusCode" INTEGER,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "responseTimeMs" INTEGER,
    "companyId" INTEGER,
    "endpoint" TEXT,

    CONSTRAINT "BoletoRequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BoletoInstallmentLog" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "billReceivableId" INTEGER,
    "installmentId" INTEGER,
    "parcelaNumber" INTEGER,
    "dueDate" TIMESTAMP(3),
    "amount" DECIMAL(12,2),
    "generatedBoleto" BOOLEAN,
    "urlReport" TEXT,
    "hasUrl" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BoletoInstallmentLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoletoRequestLog_cpf_createdAt_idx" ON "public"."BoletoRequestLog"("cpf", "createdAt");

-- CreateIndex
CREATE INDEX "BoletoRequestLog_createdAt_idx" ON "public"."BoletoRequestLog"("createdAt");

-- CreateIndex
CREATE INDEX "BoletoInstallmentLog_requestId_idx" ON "public"."BoletoInstallmentLog"("requestId");

-- CreateIndex
CREATE INDEX "BoletoInstallmentLog_billReceivableId_installmentId_idx" ON "public"."BoletoInstallmentLog"("billReceivableId", "installmentId");

-- AddForeignKey
ALTER TABLE "public"."BoletoInstallmentLog" ADD CONSTRAINT "BoletoInstallmentLog_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "public"."BoletoRequestLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
