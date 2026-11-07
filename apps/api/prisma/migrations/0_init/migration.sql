-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'RECEPTIONIST');

-- CreateEnum
CREATE TYPE "GuestStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('CIRCUIT', 'COSMETIC', 'BODY_SHAPING');

-- CreateEnum
CREATE TYPE "PassType" AS ENUM ('OCCASION_BASED', 'TIME_BASED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'PAUSED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "MembershipDueStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'WAIVED');

-- CreateEnum
CREATE TYPE "VisitType" AS ENUM ('CIRCUIT_TRAINING', 'TREATMENT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'POS_CARD', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "CheckInStatus" AS ENUM ('SUCCESS', 'DENIED', 'DUPLICATE_SCAN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('GDPR_CONSENT', 'HEALTH_QUESTIONNAIRE', 'HOUSE_RULES', 'TREATMENT_CONSENT');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING_SIGNATURE', 'SIGNED');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('SENT', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL DEFAULT 'default-studio',
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'RECEPTIONIST',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guests" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL DEFAULT 'default-studio',
    "barcode" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "birth_date" TIMESTAMP(3),
    "name_day" TEXT,
    "status" "GuestStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL DEFAULT 'default-studio',
    "name" TEXT NOT NULL,
    "category" "ServiceCategory" NOT NULL DEFAULT 'BODY_SHAPING',
    "duration_minutes" INTEGER NOT NULL DEFAULT 30,
    "price_huf" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL DEFAULT 'default-studio',
    "guest_id" TEXT NOT NULL,
    "monthly_fee_huf" INTEGER NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "due_day" INTEGER NOT NULL DEFAULT 10,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "paused_at" TIMESTAMP(3),
    "terminated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_dues" (
    "id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "amount_huf" INTEGER NOT NULL,
    "paid_amount_huf" INTEGER NOT NULL DEFAULT 0,
    "status" "MembershipDueStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_dues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pass_templates" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL DEFAULT 'default-studio',
    "service_id" TEXT,
    "name" TEXT NOT NULL,
    "type" "PassType" NOT NULL,
    "total_passes" INTEGER,
    "duration_days" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pass_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_passes" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL DEFAULT 'default-studio',
    "guest_id" TEXT NOT NULL,
    "pass_template_id" TEXT NOT NULL,
    "service_id" TEXT,
    "type" "PassType" NOT NULL,
    "total_passes" INTEGER,
    "remaining_passes" INTEGER,
    "start_date" TIMESTAMP(3) NOT NULL,
    "expiration_date" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_frozen" BOOLEAN NOT NULL DEFAULT false,
    "frozen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_passes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL DEFAULT 'default-studio',
    "guest_id" TEXT NOT NULL,
    "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visit_type" "VisitType" NOT NULL DEFAULT 'CIRCUIT_TRAINING',
    "employee_id" TEXT NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logged_check_ins" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL DEFAULT 'default-studio',
    "guest_id" TEXT NOT NULL,
    "guest_pass_id" TEXT,
    "user_id" TEXT NOT NULL,
    "visit_type" "VisitType" NOT NULL DEFAULT 'CIRCUIT_TRAINING',
    "status" "CheckInStatus" NOT NULL DEFAULT 'SUCCESS',
    "reason" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logged_check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pass_usage_logs" (
    "id" TEXT NOT NULL,
    "guest_pass_id" TEXT NOT NULL,
    "guest_id" TEXT,
    "service_id" TEXT,
    "employee_id" TEXT,
    "delta" INTEGER NOT NULL DEFAULT -1,
    "used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversed_at" TIMESTAMP(3),
    "reversal_reason" TEXT,
    "operation_key" TEXT,
    "note" TEXT,

    CONSTRAINT "pass_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL DEFAULT 'default-studio',
    "guest_id" TEXT NOT NULL,
    "guest_pass_id" TEXT,
    "recorded_by_user_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "membership_due_id" TEXT,
    "pass_id" TEXT,
    "amount_huf" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL DEFAULT 'default-studio',
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurements" (
    "id" TEXT NOT NULL,
    "guest_id" TEXT NOT NULL,
    "recorded_by_id" TEXT,
    "measured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weight_kg" DOUBLE PRECISION,
    "body_fat_pct" DOUBLE PRECISION,
    "muscle_mass_kg" DOUBLE PRECISION,
    "visceral_fat" DOUBLE PRECISION,
    "waist_cm" DOUBLE PRECISION,
    "hip_cm" DOUBLE PRECISION,
    "thigh_cm" DOUBLE PRECISION,
    "arm_cm" DOUBLE PRECISION,
    "chest_cm" DOUBLE PRECISION,
    "note" TEXT,

    CONSTRAINT "measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" TEXT NOT NULL,
    "guest_id" TEXT NOT NULL,
    "service_id" TEXT,
    "taken_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "file_url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL DEFAULT 'image/webp',
    "original_size_bytes" INTEGER NOT NULL DEFAULT 0,
    "compressed_size_bytes" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 0,
    "height" INTEGER NOT NULL DEFAULT 0,
    "visibility_role" "Role" NOT NULL DEFAULT 'RECEPTIONIST',
    "note" TEXT,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "guest_id" TEXT NOT NULL,
    "document_type" "DocumentType" NOT NULL DEFAULT 'GDPR_CONSENT',
    "title" TEXT NOT NULL,
    "content_text" TEXT NOT NULL,
    "fields_json" TEXT,
    "signature_data_url" TEXT,
    "signed_at" TIMESTAMP(3),
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING_SIGNATURE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "guest_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_logs" (
    "id" TEXT NOT NULL,
    "guest_id" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message_type" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'SENT',
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error_details" TEXT,

    CONSTRAINT "message_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "display_devices" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL DEFAULT 'default-studio',
    "name" TEXT NOT NULL,
    "pairing_code" TEXT,
    "pairing_expires_at" TIMESTAMP(3),
    "paired_at" TIMESTAMP(3),
    "device_token" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3),
    "last_activity_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "display_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_studio_id_idx" ON "users"("studio_id");

-- CreateIndex
CREATE INDEX "guests_studio_id_last_name_first_name_idx" ON "guests"("studio_id", "last_name", "first_name");

-- CreateIndex
CREATE UNIQUE INDEX "guests_studio_id_barcode_key" ON "guests"("studio_id", "barcode");

-- CreateIndex
CREATE INDEX "services_studio_id_is_active_idx" ON "services"("studio_id", "is_active");

-- CreateIndex
CREATE INDEX "memberships_guest_id_status_idx" ON "memberships"("guest_id", "status");

-- CreateIndex
CREATE INDEX "membership_dues_due_date_status_idx" ON "membership_dues"("due_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "membership_dues_membership_id_period_key" ON "membership_dues"("membership_id", "period");

-- CreateIndex
CREATE INDEX "pass_templates_studio_id_is_active_idx" ON "pass_templates"("studio_id", "is_active");

-- CreateIndex
CREATE INDEX "guest_passes_guest_id_is_active_expiration_date_idx" ON "guest_passes"("guest_id", "is_active", "expiration_date");

-- CreateIndex
CREATE INDEX "visits_guest_id_checked_in_at_idx" ON "visits"("guest_id", "checked_in_at");

-- CreateIndex
CREATE INDEX "visits_studio_id_checked_in_at_idx" ON "visits"("studio_id", "checked_in_at");

-- CreateIndex
CREATE UNIQUE INDEX "logged_check_ins_idempotency_key_key" ON "logged_check_ins"("idempotency_key");

-- CreateIndex
CREATE INDEX "logged_check_ins_guest_id_created_at_idx" ON "logged_check_ins"("guest_id", "created_at");

-- CreateIndex
CREATE INDEX "logged_check_ins_studio_id_created_at_idx" ON "logged_check_ins"("studio_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pass_usage_logs_operation_key_key" ON "pass_usage_logs"("operation_key");

-- CreateIndex
CREATE INDEX "pass_usage_logs_guest_pass_id_used_at_idx" ON "pass_usage_logs"("guest_pass_id", "used_at");

-- CreateIndex
CREATE INDEX "payments_studio_id_created_at_payment_method_idx" ON "payments"("studio_id", "created_at", "payment_method");

-- CreateIndex
CREATE INDEX "payment_allocations_payment_id_idx" ON "payment_allocations"("payment_id");

-- CreateIndex
CREATE INDEX "audit_logs_studio_id_created_at_idx" ON "audit_logs"("studio_id", "created_at");

-- CreateIndex
CREATE INDEX "measurements_guest_id_measured_at_idx" ON "measurements"("guest_id", "measured_at");

-- CreateIndex
CREATE INDEX "photos_guest_id_taken_at_idx" ON "photos"("guest_id", "taken_at");

-- CreateIndex
CREATE INDEX "documents_guest_id_status_idx" ON "documents"("guest_id", "status");

-- CreateIndex
CREATE INDEX "notes_guest_id_created_at_idx" ON "notes"("guest_id", "created_at");

-- CreateIndex
CREATE INDEX "message_logs_guest_id_sent_at_idx" ON "message_logs"("guest_id", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "display_devices_pairing_code_key" ON "display_devices"("pairing_code");

-- CreateIndex
CREATE UNIQUE INDEX "display_devices_device_token_key" ON "display_devices"("device_token");

-- CreateIndex
CREATE UNIQUE INDEX "display_devices_studio_id_name_key" ON "display_devices"("studio_id", "name");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_dues" ADD CONSTRAINT "membership_dues_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pass_templates" ADD CONSTRAINT "pass_templates_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_passes" ADD CONSTRAINT "guest_passes_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_passes" ADD CONSTRAINT "guest_passes_pass_template_id_fkey" FOREIGN KEY ("pass_template_id") REFERENCES "pass_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_passes" ADD CONSTRAINT "guest_passes_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logged_check_ins" ADD CONSTRAINT "logged_check_ins_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logged_check_ins" ADD CONSTRAINT "logged_check_ins_guest_pass_id_fkey" FOREIGN KEY ("guest_pass_id") REFERENCES "guest_passes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logged_check_ins" ADD CONSTRAINT "logged_check_ins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pass_usage_logs" ADD CONSTRAINT "pass_usage_logs_guest_pass_id_fkey" FOREIGN KEY ("guest_pass_id") REFERENCES "guest_passes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pass_usage_logs" ADD CONSTRAINT "pass_usage_logs_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pass_usage_logs" ADD CONSTRAINT "pass_usage_logs_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pass_usage_logs" ADD CONSTRAINT "pass_usage_logs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_guest_pass_id_fkey" FOREIGN KEY ("guest_pass_id") REFERENCES "guest_passes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_membership_due_id_fkey" FOREIGN KEY ("membership_due_id") REFERENCES "membership_dues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_pass_id_fkey" FOREIGN KEY ("pass_id") REFERENCES "guest_passes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

