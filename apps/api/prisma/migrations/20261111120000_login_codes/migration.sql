-- TICKET-35: belépés e-mailben küldött kóddal, jelszó nélkül.

-- CreateTable
CREATE TABLE "login_codes" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "login_codes_email_created_at_idx" ON "login_codes"("email", "created_at");

-- CreateIndex
CREATE INDEX "login_codes_created_at_idx" ON "login_codes"("created_at");

-- AlterTable: a jelszó kikerül, a meglévő hash-eket is töröljük.
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
UPDATE "users" SET "password_hash" = NULL;

-- Adat: a régi seed munkatársak nem törölhetők (befizetések, belépések hivatkoznak rájuk),
-- ezért letiltjuk őket: kódot sem kaphatnak.
UPDATE "users" SET "is_active" = false, "updated_at" = CURRENT_TIMESTAMP
WHERE "email" IN ('admin@reformstudio.hu', 'recepcio@reformstudio.hu');

-- Adat: a két kezdő munkatárs (Megrendelő, 2026-11-11), hogy a seed nélkül is be lehessen lépni.
INSERT INTO "users" ("id", "studio_id", "email", "name", "role", "is_active", "updated_at")
VALUES
    (gen_random_uuid()::text, 'default-studio', 'smark.siklodi@gmail.com', 'Siklódi Márk', 'ADMIN', true, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'default-studio', 'b.siklodi@mediajam.hu', 'Siklódi Brigi', 'ADMIN', true, CURRENT_TIMESTAMP)
ON CONFLICT ("email") DO UPDATE SET "role" = 'ADMIN', "is_active" = true, "updated_at" = CURRENT_TIMESTAMP;
