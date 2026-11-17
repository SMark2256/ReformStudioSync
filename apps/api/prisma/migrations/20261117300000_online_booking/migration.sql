-- TICKET-57: online időpontfoglalás (gépek, kezelések, foglalások, nyitvatartás, zárvatartás,
-- ünnepnap-felülírás, várólista, Google Naptár outbox, vendég belépőkód).

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'LATE', 'ARRIVED', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('ONLINE', 'RECEPTION', 'WAITLIST');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'OFFERED', 'BOOKED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CalendarSyncOperation" AS ENUM ('UPSERT', 'DELETE');

-- CreateEnum
CREATE TYPE "CalendarSyncStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- AlterTable: a vendég saját online művelete munkatárs nélkül kerül az auditnaplóba.
ALTER TABLE "audit_logs" ALTER COLUMN "user_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "booking_resources" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL DEFAULT 'default-studio',
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookable_treatments" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL DEFAULT 'default-studio',
    "resource_id" TEXT NOT NULL,
    "service_id" TEXT,
    "name" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "buffer_minutes" INTEGER NOT NULL DEFAULT 5,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_online" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookable_treatments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL DEFAULT 'default-studio',
    "group_id" TEXT NOT NULL,
    "guest_id" TEXT NOT NULL,
    "treatment_id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "blocked_until" TIMESTAMP(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "source" "BookingSource" NOT NULL DEFAULT 'RECEPTION',
    "note" TEXT,
    "pass_warning" TEXT,
    "manage_token_hash" TEXT,
    "pass_usage_id" TEXT,
    "deduction_seq" INTEGER NOT NULL DEFAULT 0,
    "google_event_id" TEXT,
    "confirmation_sent_at" TIMESTAMP(3),
    "reminder_sent_at" TIMESTAMP(3),
    "reminder_attempts" INTEGER NOT NULL DEFAULT 0,
    "arrived_at" TIMESTAMP(3),
    "no_show_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_settings" (
    "studio_id" TEXT NOT NULL DEFAULT 'default-studio',
    "opening_hours" JSONB NOT NULL,
    "max_advance_days" INTEGER NOT NULL DEFAULT 30,
    "min_lead_minutes" INTEGER NOT NULL DEFAULT 30,
    "change_cutoff_hours" INTEGER NOT NULL DEFAULT 24,
    "hold_minutes" INTEGER NOT NULL DEFAULT 30,
    "slot_step_minutes" INTEGER NOT NULL DEFAULT 15,
    "location_text" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_settings_pkey" PRIMARY KEY ("studio_id")
);

-- CreateTable
CREATE TABLE "booking_closures" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL DEFAULT 'default-studio',
    "resource_id" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_closures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_holiday_overrides" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL DEFAULT 'default-studio',
    "day_key" TEXT NOT NULL,
    "is_open" BOOLEAN NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_holiday_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_waitlist" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL DEFAULT 'default-studio',
    "guest_id" TEXT NOT NULL,
    "treatment_id" TEXT NOT NULL,
    "day_key" TEXT NOT NULL,
    "from_minutes" INTEGER NOT NULL,
    "to_minutes" INTEGER NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "offer_starts_at" TIMESTAMP(3),
    "offer_expires_at" TIMESTAMP(3),
    "offer_token_hash" TEXT,
    "offered_at" TIMESTAMP(3),
    "booking_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_sync_outbox" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL DEFAULT 'default-studio',
    "booking_id" TEXT NOT NULL,
    "operation" "CalendarSyncOperation" NOT NULL,
    "status" "CalendarSyncStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_sync_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_login_codes" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_login_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "booking_resources_studio_id_name_key" ON "booking_resources"("studio_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "bookable_treatments_studio_id_name_key" ON "bookable_treatments"("studio_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_manage_token_hash_key" ON "bookings"("manage_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_pass_usage_id_key" ON "bookings"("pass_usage_id");

-- CreateIndex
CREATE INDEX "bookings_studio_id_starts_at_idx" ON "bookings"("studio_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_resource_id_starts_at_idx" ON "bookings"("resource_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_guest_id_starts_at_idx" ON "bookings"("guest_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_group_id_idx" ON "bookings"("group_id");

-- CreateIndex
CREATE INDEX "bookings_status_starts_at_idx" ON "bookings"("status", "starts_at");

-- CreateIndex
CREATE INDEX "booking_closures_studio_id_starts_at_idx" ON "booking_closures"("studio_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "booking_holiday_overrides_studio_id_day_key_key" ON "booking_holiday_overrides"("studio_id", "day_key");

-- CreateIndex
CREATE UNIQUE INDEX "booking_waitlist_offer_token_hash_key" ON "booking_waitlist"("offer_token_hash");

-- CreateIndex
CREATE INDEX "booking_waitlist_studio_id_day_key_status_idx" ON "booking_waitlist"("studio_id", "day_key", "status");

-- CreateIndex
CREATE INDEX "booking_waitlist_status_offer_expires_at_idx" ON "booking_waitlist"("status", "offer_expires_at");

-- CreateIndex
CREATE INDEX "calendar_sync_outbox_status_next_attempt_at_idx" ON "calendar_sync_outbox"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "calendar_sync_outbox_booking_id_status_idx" ON "calendar_sync_outbox"("booking_id", "status");

-- CreateIndex
CREATE INDEX "guest_login_codes_email_created_at_idx" ON "guest_login_codes"("email", "created_at");

-- CreateIndex
CREATE INDEX "guest_login_codes_created_at_idx" ON "guest_login_codes"("created_at");

-- AddForeignKey
ALTER TABLE "bookable_treatments" ADD CONSTRAINT "bookable_treatments_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "booking_resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookable_treatments" ADD CONSTRAINT "bookable_treatments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "bookable_treatments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "booking_resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_pass_usage_id_fkey" FOREIGN KEY ("pass_usage_id") REFERENCES "pass_usage_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_closures" ADD CONSTRAINT "booking_closures_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "booking_resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_waitlist" ADD CONSTRAINT "booking_waitlist_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_waitlist" ADD CONSTRAINT "booking_waitlist_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "bookable_treatments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_sync_outbox" ADD CONSTRAINT "calendar_sync_outbox_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Adat: a ticket táblázatának gépei és kezelései (a sorrend a kezdeti kezelési sorrend), és a
-- hozzájuk tartozó szolgáltatások, hogy a bérletillesztés a seed nélkül is működjön.
INSERT INTO "services" ("id", "studio_id", "name", "category", "duration_minutes", "price_huf", "women_only", "is_active", "created_at")
SELECT gen_random_uuid()::text, 'default-studio', v.name, 'BODY_SHAPING', v.minutes, 0, false, true, CURRENT_TIMESTAMP
FROM (VALUES
    ('Hypoxi', 30),
    ('Gépi nyirokmasszázs', 30),
    ('HIEMT', 30),
    ('Intimpad', 30),
    ('Ceragem', 40),
    ('Flabelos', 10)
) AS v(name, minutes)
WHERE NOT EXISTS (
    SELECT 1 FROM "services" s WHERE s."studio_id" = 'default-studio' AND s."name" = v.name
);

INSERT INTO "booking_resources" ("id", "studio_id", "name", "capacity", "sort_order")
VALUES
    (gen_random_uuid()::text, 'default-studio', 'Hypoxi Trainer', 3, 1),
    (gen_random_uuid()::text, 'default-studio', 'Nyirokmasszázs gép', 2, 2),
    (gen_random_uuid()::text, 'default-studio', 'HIEMT / Intimpad gép', 1, 3),
    (gen_random_uuid()::text, 'default-studio', 'Ceragem', 1, 4),
    (gen_random_uuid()::text, 'default-studio', 'Flabelos', 1, 5)
ON CONFLICT ("studio_id", "name") DO NOTHING;

INSERT INTO "bookable_treatments" ("id", "studio_id", "resource_id", "service_id", "name", "duration_minutes", "buffer_minutes", "sort_order")
SELECT gen_random_uuid()::text, 'default-studio', r."id",
    (SELECT s."id" FROM "services" s WHERE s."studio_id" = 'default-studio' AND s."name" = v.service_name ORDER BY s."created_at" LIMIT 1),
    v.name, v.minutes, 5, v.sort_order
FROM (VALUES
    ('Hypoxi Trainer', 'Hypoxi Trainer', 'Hypoxi', 30, 1),
    ('Gépi nyirokmasszázs', 'Nyirokmasszázs gép', 'Gépi nyirokmasszázs', 30, 2),
    ('HIEMT', 'HIEMT / Intimpad gép', 'HIEMT', 30, 3),
    ('Intimpad', 'HIEMT / Intimpad gép', 'Intimpad', 30, 4),
    ('Ceragem', 'Ceragem', 'Ceragem', 40, 5),
    ('Flabelos', 'Flabelos', 'Flabelos', 10, 6)
) AS v(name, resource_name, service_name, minutes, sort_order)
JOIN "booking_resources" r ON r."studio_id" = 'default-studio' AND r."name" = v.resource_name
ON CONFLICT ("studio_id", "name") DO NOTHING;

INSERT INTO "booking_settings" ("studio_id", "opening_hours", "updated_at")
VALUES (
    'default-studio',
    '[{"opensAt":420,"closesAt":1080},{"opensAt":420,"closesAt":1080},{"opensAt":420,"closesAt":1080},{"opensAt":420,"closesAt":1080},{"opensAt":420,"closesAt":1080},null,null]'::jsonb,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("studio_id") DO NOTHING;
