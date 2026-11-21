-- Beauty alap (TICKET-59): a „Kozmetikus 1” erőforrás és a kozmetikai kezelések, valamint az
-- utolsó kezdés a nyitvatartásban. Sémaváltozás nincs, csak adat; többszöri futtatásra is
-- idempotens, és a recepción átírt értékeket nem írja felül.

INSERT INTO "booking_resources" ("id", "studio_id", "name", "capacity", "sort_order")
VALUES (gen_random_uuid()::text, 'default-studio', 'Kozmetikus 1', 1, 6)
ON CONFLICT ("studio_id", "name") DO NOTHING;

-- A kozmetikai kezelések a kozmetikai bérlet szolgáltatásához kapcsolódnak, így megérkezéskor a
-- gépi szabály szerint 1 alkalom levonódik belőle. Sorrend: az „5 Alkalmas Prémium Kozmetikai
-- Bérlet” sablon szolgáltatása, a seed kozmetikai szolgáltatása, végül a legrégebbi aktív
-- kozmetikai szolgáltatás. Ha egyik sincs, a kezelés szolgáltatás nélküli (csak általános bérlet).
-- Szünet nincs (a 120 perc az előkészítést és az elpakolást is tartalmazza), online nem foglalható.
INSERT INTO "bookable_treatments" ("id", "studio_id", "resource_id", "service_id", "name", "duration_minutes", "buffer_minutes", "sort_order", "is_online")
SELECT gen_random_uuid()::text, 'default-studio', r."id",
    COALESCE(
        (SELECT pt."service_id" FROM "pass_templates" pt
            WHERE pt."studio_id" = 'default-studio' AND pt."name" = '5 Alkalmas Prémium Kozmetikai Bérlet' AND pt."service_id" IS NOT NULL
            ORDER BY pt."created_at" LIMIT 1),
        (SELECT s."id" FROM "services" s
            WHERE s."studio_id" = 'default-studio' AND s."name" = 'Hialuronos Arckezelés & Rádiófrekvencia'
            ORDER BY s."created_at" LIMIT 1),
        (SELECT s."id" FROM "services" s
            WHERE s."studio_id" = 'default-studio' AND s."category" = 'COSMETIC' AND s."is_active"
            ORDER BY s."created_at" LIMIT 1)
    ),
    v.name, v.minutes, 0, v.sort_order, false
FROM (VALUES
    ('Fúziós plazma', 120, 7),
    ('Hollywood Peel', 120, 8),
    ('Hydrodermabrázió', 120, 9),
    ('Mikrodermabrázió', 120, 10),
    ('Dermapen', 120, 11),
    ('Tű nélküli mezoterápia', 120, 12),
    ('Rádiófrekvenciás arckezelés', 120, 13),
    ('Anti-aging arckezelés', 120, 14),
    ('Tisztító arckezelés', 120, 15),
    ('Arcmasszázs', 60, 16),
    ('Szemöldök-laminálás festéssel', 60, 17),
    ('Szempilla-lifting festéssel', 60, 18),
    ('Lézeres szőrtelenítés: hónalj', 30, 19),
    ('Lézeres szőrtelenítés: bikinivonal', 30, 20),
    ('Lézeres szőrtelenítés: lábszár', 60, 21),
    ('Lézeres szőrtelenítés: comb', 60, 22),
    ('Lézeres szőrtelenítés: teljes láb', 60, 23),
    ('Lézeres szőrtelenítés: teljes kar', 60, 24),
    ('Lézeres szőrtelenítés: hát', 60, 25),
    ('Lézeres szőrtelenítés: teljes intim', 60, 26)
) AS v(name, minutes, sort_order)
JOIN "booking_resources" r ON r."studio_id" = 'default-studio' AND r."name" = 'Kozmetikus 1'
ON CONFLICT ("studio_id", "name") DO NOTHING;

-- Nyitvatartás: a korábbi alapértelmezés (07:00–18:00) helyett 07:00–19:00, utolsó kezdés 18:00.
-- A recepción beállított más napoknál az utolsó kezdés a zárás (nincs külön korlát).
UPDATE "booking_settings" bs
SET "opening_hours" = (
    SELECT jsonb_agg(
        CASE
            WHEN jsonb_typeof(d.value) <> 'object' OR d.value ? 'lastStartAt' THEN d.value
            WHEN d.value = '{"opensAt":420,"closesAt":1080}'::jsonb
                THEN '{"opensAt":420,"closesAt":1140,"lastStartAt":1080}'::jsonb
            ELSE d.value || jsonb_build_object('lastStartAt', d.value -> 'closesAt')
        END
        ORDER BY d.ordinality
    )
    FROM jsonb_array_elements(bs."opening_hours") WITH ORDINALITY AS d(value, ordinality)
),
    "updated_at" = CURRENT_TIMESTAMP
WHERE jsonb_typeof(bs."opening_hours") = 'array' AND jsonb_array_length(bs."opening_hours") > 0;
