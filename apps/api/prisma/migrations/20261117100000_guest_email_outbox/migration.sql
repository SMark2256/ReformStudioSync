-- TICKET-55: vendégkommunikáció — e-mail-sablonok, automatikus levelek, marketing-hozzájárulás és
-- leiratkozás, kimenő sor. A `message_logs` tábla lett a sor és a napló; a régi sorok megmaradnak.

-- CreateEnum
CREATE TYPE "EmailCategory" AS ENUM ('TRANSACTIONAL', 'MARKETING');

-- CreateEnum
CREATE TYPE "EmailAutomationKind" AS ENUM ('WELCOME', 'BIRTHDAY', 'NAME_DAY');

-- AlterEnum: PENDING kell a sorhoz; a régi DELIVERED (csak naplózott, valójában ki nem küldött
-- levél) SENT lesz. Új típussal, mert az ADD VALUE-val bővített értéket ugyanebben a
-- tranzakcióban nem lehetne alapértéknek használni.
CREATE TYPE "MessageStatus_new" AS ENUM ('PENDING', 'SENT', 'FAILED');
ALTER TABLE "message_logs" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "message_logs" ALTER COLUMN "status" TYPE "MessageStatus_new"
    USING (CASE "status"::text WHEN 'DELIVERED' THEN 'SENT' ELSE "status"::text END)::"MessageStatus_new";
ALTER TYPE "MessageStatus" RENAME TO "MessageStatus_old";
ALTER TYPE "MessageStatus_new" RENAME TO "MessageStatus";
DROP TYPE "MessageStatus_old";
ALTER TABLE "message_logs" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable: hozzájárulás és leiratkozó token a vendégeknél (a meglévőknek is egyedi token).
ALTER TABLE "guests" ADD COLUMN     "marketing_consent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketing_consent_at" TIMESTAMP(3),
ADD COLUMN     "unsubscribe_token" TEXT,
ADD COLUMN     "unsubscribed_at" TIMESTAMP(3);
UPDATE "guests" SET "unsubscribe_token" = gen_random_uuid()::text WHERE "unsubscribe_token" IS NULL;
ALTER TABLE "guests" ALTER COLUMN "unsubscribe_token" SET NOT NULL;

-- AlterTable: a napló kimenő sorrá bővül.
ALTER TABLE "message_logs" ADD COLUMN     "studio_id" TEXT NOT NULL DEFAULT 'default-studio',
ADD COLUMN     "recipient_name" TEXT,
ADD COLUMN     "category" "EmailCategory" NOT NULL DEFAULT 'TRANSACTIONAL',
ADD COLUMN     "html" TEXT,
ADD COLUMN     "text" TEXT,
ADD COLUMN     "template_id" TEXT,
ADD COLUMN     "template_name" TEXT,
ADD COLUMN     "batch_id" TEXT,
ADD COLUMN     "dedupe_key" TEXT,
ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "last_attempt_at" TIMESTAMP(3),
ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "guest_id" DROP NOT NULL,
ALTER COLUMN "sent_at" DROP NOT NULL,
ALTER COLUMN "sent_at" DROP DEFAULT;

-- Adat: a régi sorok sorba kerülésének ideje a régi `sent_at`; hibás levél nem ment ki.
UPDATE "message_logs" SET "created_at" = "sent_at", "next_attempt_at" = "sent_at" WHERE "sent_at" IS NOT NULL;
UPDATE "message_logs" SET "sent_at" = NULL WHERE "status" = 'FAILED';

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL DEFAULT 'default-studio',
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body_html" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_automations" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL DEFAULT 'default-studio',
    "kind" "EmailAutomationKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "template_id" TEXT,
    "enabled_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_automations_pkey" PRIMARY KEY ("id")
);

-- DropIndex
DROP INDEX "message_logs_guest_id_sent_at_idx";

-- CreateIndex
CREATE UNIQUE INDEX "guests_unsubscribe_token_key" ON "guests"("unsubscribe_token");

-- CreateIndex
CREATE UNIQUE INDEX "message_logs_dedupe_key_key" ON "message_logs"("dedupe_key");

-- CreateIndex
CREATE INDEX "message_logs_guest_id_created_at_idx" ON "message_logs"("guest_id", "created_at");

-- CreateIndex
CREATE INDEX "message_logs_studio_id_created_at_idx" ON "message_logs"("studio_id", "created_at");

-- CreateIndex
CREATE INDEX "message_logs_status_next_attempt_at_idx" ON "message_logs"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "message_logs_status_sent_at_idx" ON "message_logs"("status", "sent_at");

-- CreateIndex
CREATE INDEX "email_templates_studio_id_name_idx" ON "email_templates"("studio_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "email_automations_studio_id_kind_key" ON "email_automations"("studio_id", "kind");

-- AddForeignKey: a vendég törlése után a napló megmarad (korábban kaszkádolt).
ALTER TABLE "message_logs" DROP CONSTRAINT "message_logs_guest_id_fkey";
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_automations" ADD CONSTRAINT "email_automations_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Adat: a három automatikus levél kikapcsolva, sablon nélkül („nincs beállítva”).
INSERT INTO "email_automations" ("id", "studio_id", "kind", "enabled", "updated_at")
VALUES
    (gen_random_uuid()::text, 'default-studio', 'WELCOME', false, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'default-studio', 'BIRTHDAY', false, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'default-studio', 'NAME_DAY', false, CURRENT_TIMESTAMP)
ON CONFLICT ("studio_id", "kind") DO NOTHING;
