-- AlterTable
ALTER TABLE "Contact" ALTER COLUMN "linkPrecedence" SET DEFAULT 'primary';

-- CreateIndex
CREATE INDEX "Contact_linkedId_idx" ON "Contact"("linkedId");
