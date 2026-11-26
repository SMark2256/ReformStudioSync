-- Napijegy (TICKET-7), adat: az „1 Alkalmas Napijegy” sablonok és az eladott jegyeik napijeggyé
-- válnak. Sémaváltozás nincs; többszöri futtatásra is idempotens (csak a még nem napijegy sorokat
-- érinti).
--
-- Megrendelői döntés a régi, eladott jegyek lejáratáról (2026-11-26):
-- - már lejárt jegy lejárt marad (csak a típusa változik);
-- - a még érvényes jegy régi lejárata marad, ha az később van, mint az eladás napjának zárása
--   (`valid_until` üres, a régi, napra pontos lejárat számít);
-- - különben a lejárat az eladás napjának zárása (`expiration_date` = `valid_until` = zárás).
-- A zárás az eladás napjának heti nyitvatartásából jön (`booking_settings.opening_hours`, ha nincs:
-- H–P 07:00–19:00); zárt napon, vagy ha az eladás a zárás után történt, a nap vége
-- (Europe/Budapest), mint az új eladásnál (`dayTicketValidUntil`). Eltérés az új eladástól: a
-- munkaszüneti napokat és a recepciós felülírásokat ez a visszamenőleges számítás nem nézi.
-- Az alkalomszám (1) és a felhasználási napló nem változik.

UPDATE "pass_templates"
SET "type" = 'DAY_TICKET', "total_passes" = 1, "duration_days" = 1
WHERE lower(btrim("name")) = lower('1 Alkalmas Napijegy') AND "type" <> 'DAY_TICKET';

WITH sold AS (
    SELECT gp."id",
        gp."created_at",
        gp."expiration_date",
        (gp."created_at" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Budapest')::date AS sale_day,
        CASE
            WHEN jsonb_typeof(bs."opening_hours") = 'array' AND jsonb_array_length(bs."opening_hours") = 7
                THEN bs."opening_hours"
            ELSE '[{"opensAt":420,"closesAt":1140},{"opensAt":420,"closesAt":1140},{"opensAt":420,"closesAt":1140},{"opensAt":420,"closesAt":1140},{"opensAt":420,"closesAt":1140},null,null]'::jsonb
        END AS opening_hours
    FROM "guest_passes" gp
    JOIN "pass_templates" pt ON pt."id" = gp."pass_template_id"
    LEFT JOIN "booking_settings" bs ON bs."studio_id" = gp."studio_id"
    WHERE pt."type" = 'DAY_TICKET' AND gp."type" <> 'DAY_TICKET'
),
day_hours AS (
    SELECT s.*, s.opening_hours -> (EXTRACT(ISODOW FROM s.sale_day)::int - 1) AS hours
    FROM sold s
),
closing AS (
    SELECT d."id",
        d."expiration_date",
        -- A nap vége: a következő nap éjfele előtt 1 ms, UTC-ben (az oszlopok időzóna nélküli UTC-k).
        ((((d.sale_day + 1)::timestamp AT TIME ZONE 'Europe/Budapest') AT TIME ZONE 'UTC') - interval '1 millisecond') AS end_of_day,
        CASE
            WHEN jsonb_typeof(d.hours) = 'object' AND jsonb_typeof(d.hours -> 'closesAt') = 'number'
                THEN ((d.sale_day::timestamp + make_interval(mins => (d.hours ->> 'closesAt')::int)) AT TIME ZONE 'Europe/Budapest') AT TIME ZONE 'UTC'
        END AS closes_at,
        d."created_at"
    FROM day_hours d
),
resolved AS (
    SELECT c."id",
        c."expiration_date",
        CASE WHEN c.closes_at IS NOT NULL AND c.closes_at > c."created_at" THEN c.closes_at ELSE c.end_of_day END AS valid_until
    FROM closing c
)
UPDATE "guest_passes" gp
SET "type" = 'DAY_TICKET',
    "valid_until" = CASE
        WHEN r."expiration_date" >= (now() AT TIME ZONE 'UTC') AND r."expiration_date" <= r.valid_until
            THEN r.valid_until
        ELSE NULL
    END,
    "expiration_date" = CASE
        WHEN r."expiration_date" >= (now() AT TIME ZONE 'UTC') AND r."expiration_date" <= r.valid_until
            THEN r.valid_until
        ELSE r."expiration_date"
    END
FROM resolved r
WHERE gp."id" = r."id";
