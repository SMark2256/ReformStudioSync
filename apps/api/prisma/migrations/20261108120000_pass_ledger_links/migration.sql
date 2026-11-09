-- TICKET-16: bérlet-alkalom egyetlen forrásból.
-- Hátralévő alkalom = összes − nem visszavont levonások (pass_usage_logs, delta < 0, reversed_at IS NULL).
-- A levonás és a beléptetés, illetve a beléptetés és a látogatás össze van kötve, így bármelyik
-- oldal visszavonása a másikat is lezárja, és a jóváírás csak egyszer történik meg.

-- AlterTable
ALTER TABLE "guest_passes" ADD COLUMN     "cancelled_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "logged_check_ins" ADD COLUMN     "visit_id" TEXT;

-- AlterTable
ALTER TABLE "pass_usage_logs" ADD COLUMN     "check_in_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "logged_check_ins_visit_id_key" ON "logged_check_ins"("visit_id");

-- CreateIndex
CREATE UNIQUE INDEX "pass_usage_logs_check_in_id_key" ON "pass_usage_logs"("check_in_id");

-- CreateIndex (az eladási befizetés keresése a sztornónál)
CREATE INDEX "payments_guest_pass_id_created_at_idx" ON "payments"("guest_pass_id", "created_at");

-- AddForeignKey
ALTER TABLE "logged_check_ins" ADD CONSTRAINT "logged_check_ins_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pass_usage_logs" ADD CONSTRAINT "pass_usage_logs_check_in_id_fkey" FOREIGN KEY ("check_in_id") REFERENCES "logged_check_ins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Adatátvezetés 1: a korábbi levonások összekötése a velük egy tranzakcióban rögzített beléptetéssel
-- (ugyanaz a bérlet, kezelés típusú beléptetés, legfeljebb 5 mp eltérés; a legközelebbi nyer).
WITH candidates AS (
  SELECT DISTINCT ON (c."id") c."id" AS check_in_id, u."id" AS usage_id
  FROM "pass_usage_logs" u
  JOIN "logged_check_ins" c
    ON c."guest_pass_id" = u."guest_pass_id"
   AND c."visit_type" = 'TREATMENT'
   AND c."status" IN ('SUCCESS', 'CANCELLED')
   AND abs(extract(epoch FROM (c."created_at" - u."used_at"))) <= 5
  WHERE u."delta" < 0 AND u."check_in_id" IS NULL
  ORDER BY c."id", abs(extract(epoch FROM (c."created_at" - u."used_at")))
),
one_per_usage AS (
  SELECT DISTINCT ON (usage_id) usage_id, check_in_id FROM candidates ORDER BY usage_id, check_in_id
)
UPDATE "pass_usage_logs" u
SET "check_in_id" = o.check_in_id
FROM one_per_usage o
WHERE u."id" = o.usage_id;

-- Adatátvezetés 2: a korábbi beléptetések összekötése a látogatással (ugyanaz a vendég és típus, ≤ 5 mp).
WITH candidates AS (
  SELECT DISTINCT ON (v."id") v."id" AS visit_id, c."id" AS check_in_id
  FROM "logged_check_ins" c
  JOIN "visits" v
    ON v."guest_id" = c."guest_id"
   AND v."studio_id" = c."studio_id"
   AND v."visit_type" = c."visit_type"
   AND abs(extract(epoch FROM (v."checked_in_at" - c."created_at"))) <= 5
  WHERE c."status" = 'SUCCESS' AND c."visit_id" IS NULL
  ORDER BY v."id", abs(extract(epoch FROM (v."checked_in_at" - c."created_at")))
),
one_per_check_in AS (
  SELECT DISTINCT ON (check_in_id) check_in_id, visit_id FROM candidates ORDER BY check_in_id, visit_id
)
UPDATE "logged_check_ins" c
SET "visit_id" = o.visit_id
FROM one_per_check_in o
WHERE c."id" = o.check_in_id;

-- Adatátvezetés 3: a régi beléptetés-sztornó +1 naplósort írt, de az eredeti levonást nem jelölte
-- visszavontnak. A sztornózott beléptetéshez tartozó levonás mostantól visszavont.
UPDATE "pass_usage_logs" u
SET "reversed_at" = CURRENT_TIMESTAMP,
    "reversal_reason" = 'Beléptetés sztornó (korábbi adat átvezetése)'
FROM "logged_check_ins" c
WHERE u."check_in_id" = c."id"
  AND c."status" = 'CANCELLED'
  AND u."delta" < 0
  AND u."reversed_at" IS NULL;

-- Adatátvezetés 4: eladási befizetés sztornója = a bérlet sztornója. Az eladási befizetés a bérlet
-- legkorábbi befizetése; egy későbbi részlet sztornója nem zárja le a bérletet.
UPDATE "guest_passes" p
SET "cancelled_at" = CURRENT_TIMESTAMP
WHERE p."cancelled_at" IS NULL
  AND EXISTS (
    SELECT 1 FROM "payments" pay
    WHERE pay."id" = (
      SELECT first_pay."id" FROM "payments" first_pay
      WHERE first_pay."guest_pass_id" = p."id"
      ORDER BY first_pay."created_at", first_pay."id"
      LIMIT 1
    )
      AND pay."is_cancelled" = true
  );

-- Adatátvezetés 5: remaining_passes újraszámolása a naplóból, és az is_active jelző egységesítése
-- (aktív = nincs sztornózva és van alkalom; a lejáratot a számolt állapot kezeli).
UPDATE "guest_passes" p
SET "remaining_passes" = GREATEST(0, p."total_passes" - (
  SELECT count(*) FROM "pass_usage_logs" u
  WHERE u."guest_pass_id" = p."id" AND u."delta" < 0 AND u."reversed_at" IS NULL
))
WHERE p."type" = 'OCCASION_BASED' AND p."total_passes" IS NOT NULL;

UPDATE "guest_passes" p
SET "is_active" = (p."cancelled_at" IS NULL AND (p."type" = 'TIME_BASED' OR COALESCE(p."remaining_passes", 0) > 0));
