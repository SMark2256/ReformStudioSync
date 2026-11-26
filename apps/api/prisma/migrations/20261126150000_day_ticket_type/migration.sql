-- Napijegy külön bérlettípus (TICKET-7): új `DAY_TICKET` érték és a percre pontos lejárat
-- (`valid_until`, nullable: a régi bérleteknél és az új nem napijegyeknél üres, csak a napra pontos
-- `expiration_date` számít). A meglévő adat átalakítása a következő migrációban van, mert az
-- ADD VALUE-val bővített enumértéket ugyanabban a tranzakcióban nem lehet használni.

-- AlterEnum
ALTER TYPE "PassType" ADD VALUE 'DAY_TICKET';

-- AlterTable
ALTER TABLE "guest_passes" ADD COLUMN     "valid_until" TIMESTAMP(3);
