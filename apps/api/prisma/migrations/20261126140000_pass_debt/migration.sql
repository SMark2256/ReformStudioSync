-- Bérlet-hátralék (TICKET-14): eladáskori ár és a hátralék keletkezésének időpontja.
-- Mindkét oszlop nullable (nincs default), így a régi kód a mezőket egyszerűen figyelmen kívül hagyja.
ALTER TABLE "guest_passes" ADD COLUMN "price_huf" INTEGER;
ALTER TABLE "guest_passes" ADD COLUMN "debt_since" TIMESTAMP(3);

-- A hátralék a hozzárendelésekből számolódik. A régi eladások allokációja hibatűrően
-- (`.catch`) készült, ezért a bérlethez kötött, allokáció nélküli befizetések pótlást kapnak.
INSERT INTO "payment_allocations" ("id", "payment_id", "pass_id", "amount_huf", "created_at")
SELECT gen_random_uuid()::text, p."id", p."guest_pass_id", ROUND(p."amount")::integer, p."created_at"
FROM "payments" p
WHERE p."guest_pass_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "payment_allocations" a WHERE a."payment_id" = p."id");

-- Backfill: eddig csak teljes áron lehetett eladni, így az eladáskori ár a bérlet első
-- (eladási) befizetésének összege, sztornótól függetlenül. A régi bérleteknél így nincs
-- hátralék. Befizetés nélküli bérletnél az ár ismeretlen marad (`NULL`, a felület jelzi).
UPDATE "guest_passes" gp
SET "price_huf" = sale."amount_huf"
FROM (
    SELECT DISTINCT ON (p."guest_pass_id") p."guest_pass_id", ROUND(p."amount")::integer AS "amount_huf"
    FROM "payments" p
    WHERE p."guest_pass_id" IS NOT NULL
    ORDER BY p."guest_pass_id", p."created_at" ASC, p."id" ASC
) sale
WHERE gp."id" = sale."guest_pass_id" AND gp."price_huf" IS NULL;

-- Ha egy régi bérletnél a sztornók miatt mégis maradt hátralék, a keletkezése a vásárlás napja.
UPDATE "guest_passes" gp
SET "debt_since" = gp."created_at"
WHERE gp."price_huf" IS NOT NULL
  AND gp."cancelled_at" IS NULL
  AND gp."debt_since" IS NULL
  AND gp."price_huf" > COALESCE((
      SELECT SUM(a."amount_huf")
      FROM "payment_allocations" a
      JOIN "payments" p ON p."id" = a."payment_id"
      WHERE a."pass_id" = gp."id" AND NOT p."is_cancelled"
  ), 0);
