-- TICKET-53: a látott oldalbemutatók a fiókban (tours modul), hogy másik gépen se jöjjön újra
-- a felajánlás.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "tour_state" JSONB NOT NULL DEFAULT '{}';
