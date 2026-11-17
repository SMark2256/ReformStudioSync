-- TICKET-56: tabletes vendégfelvétel. Felvételi csomagok és verziózott kérdőívek, a felvétel
-- munkamenete (állapotgép, vendégmód-token), elkülönített egészségügyi válaszok, az aláírt
-- dokumentumok változatlan pillanatképe, bővített mérések, profilkép és a tablet eszköztípus.

-- CreateEnum
CREATE TYPE "DisplayDeviceKind" AS ENUM ('MONITOR', 'TABLET');

-- CreateEnum
CREATE TYPE "IntakeStatus" AS ENUM ('PREPARED', 'GUEST_FILLING', 'AWAITING_REVIEW', 'APPROVED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PhotoPurpose" AS ENUM ('PROGRESS', 'PROFILE');

-- AlterTable
ALTER TABLE "display_devices" ADD COLUMN     "kind" "DisplayDeviceKind" NOT NULL DEFAULT 'MONITOR';

-- AlterTable
ALTER TABLE "photos" ADD COLUMN     "purpose" "PhotoPurpose" NOT NULL DEFAULT 'PROGRESS';

-- AlterTable
ALTER TABLE "measurements" ADD COLUMN     "bmi" DOUBLE PRECISION,
ADD COLUMN     "skeletal_muscle_pct" DOUBLE PRECISION,
ADD COLUMN     "resting_metabolism_kcal" DOUBLE PRECISION,
ADD COLUMN     "abdomen_cm" DOUBLE PRECISION,
ADD COLUMN     "above_knee_cm" DOUBLE PRECISION,
ADD COLUMN     "calf_cm" DOUBLE PRECISION,
ADD COLUMN     "intake_session_id" TEXT;

-- CreateTable
CREATE TABLE "intake_packages" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL DEFAULT 'default-studio',
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "form_keys" TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intake_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_form_definitions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "body_text" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "requires_signature" BOOLEAN NOT NULL DEFAULT true,
    "legal_review_pending" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intake_form_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_sessions" (
    "id" TEXT NOT NULL,
    "studio_id" TEXT NOT NULL DEFAULT 'default-studio',
    "guest_id" TEXT,
    "link_guest_id" TEXT,
    "status" "IntakeStatus" NOT NULL DEFAULT 'PREPARED',
    "source" TEXT NOT NULL DEFAULT 'PC',
    "package_keys" TEXT[],
    "form_refs" JSONB NOT NULL,
    "profile_draft" JSONB NOT NULL DEFAULT '{}',
    "answers" JSONB NOT NULL DEFAULT '{}',
    "measurement_draft" JSONB NOT NULL DEFAULT '{}',
    "profile_photo_data_url" TEXT,
    "signature_data_url" TEXT,
    "signed_at" TIMESTAMP(3),
    "guest_token_hash" TEXT,
    "guest_token_expires_at" TIMESTAMP(3),
    "exit_code_hash" TEXT,
    "exit_attempts" INTEGER NOT NULL DEFAULT 0,
    "handover_user_id" TEXT,
    "assigned_device_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intake_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_health_records" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "guest_id" TEXT,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "consent_given_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intake_health_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_document_snapshots" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "guest_id" TEXT NOT NULL,
    "form_key" TEXT NOT NULL,
    "form_version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "signature_data_url" TEXT NOT NULL,
    "signed_at" TIMESTAMP(3) NOT NULL,
    "legal_review_pending" BOOLEAN NOT NULL,
    "content_hash" TEXT NOT NULL,
    "pdf_storage_key" TEXT,
    "pdf_size_bytes" INTEGER,
    "pdf_created_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intake_document_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "intake_packages_studio_id_key_key" ON "intake_packages"("studio_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "intake_form_definitions_key_version_key" ON "intake_form_definitions"("key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "intake_sessions_guest_token_hash_key" ON "intake_sessions"("guest_token_hash");

-- CreateIndex
CREATE INDEX "intake_sessions_studio_id_status_updated_at_idx" ON "intake_sessions"("studio_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "intake_sessions_guest_id_idx" ON "intake_sessions"("guest_id");

-- CreateIndex
CREATE INDEX "intake_sessions_assigned_device_id_status_idx" ON "intake_sessions"("assigned_device_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "intake_health_records_session_id_key" ON "intake_health_records"("session_id");

-- CreateIndex
CREATE INDEX "intake_health_records_guest_id_idx" ON "intake_health_records"("guest_id");

-- CreateIndex
CREATE UNIQUE INDEX "intake_document_snapshots_session_id_form_key_key" ON "intake_document_snapshots"("session_id", "form_key");

-- CreateIndex
CREATE INDEX "intake_document_snapshots_guest_id_signed_at_idx" ON "intake_document_snapshots"("guest_id", "signed_at");

-- AddForeignKey
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_intake_session_id_fkey" FOREIGN KEY ("intake_session_id") REFERENCES "intake_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_sessions" ADD CONSTRAINT "intake_sessions_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_sessions" ADD CONSTRAINT "intake_sessions_assigned_device_id_fkey" FOREIGN KEY ("assigned_device_id") REFERENCES "display_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_sessions" ADD CONSTRAINT "intake_sessions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_sessions" ADD CONSTRAINT "intake_sessions_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_health_records" ADD CONSTRAINT "intake_health_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "intake_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_health_records" ADD CONSTRAINT "intake_health_records_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_document_snapshots" ADD CONSTRAINT "intake_document_snapshots_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "intake_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_document_snapshots" ADD CONSTRAINT "intake_document_snapshots_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Az aláírt pillanatkép tartalma nem módosítható: csak a PDF oszlopai tölthetők ki utólag
-- (a lezáráskor vagy az újrapróbáláskor). Bármely tartalmi oszlop változása hibát dob.
CREATE FUNCTION "intake_snapshot_immutable"() RETURNS trigger AS $$
BEGIN
  IF NEW."session_id" IS DISTINCT FROM OLD."session_id"
    OR NEW."guest_id" IS DISTINCT FROM OLD."guest_id"
    OR NEW."form_key" IS DISTINCT FROM OLD."form_key"
    OR NEW."form_version" IS DISTINCT FROM OLD."form_version"
    OR NEW."title" IS DISTINCT FROM OLD."title"
    OR NEW."body_text" IS DISTINCT FROM OLD."body_text"
    OR NEW."answers" IS DISTINCT FROM OLD."answers"
    OR NEW."signature_data_url" IS DISTINCT FROM OLD."signature_data_url"
    OR NEW."signed_at" IS DISTINCT FROM OLD."signed_at"
    OR NEW."legal_review_pending" IS DISTINCT FROM OLD."legal_review_pending"
    OR NEW."content_hash" IS DISTINCT FROM OLD."content_hash"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'Az aláírt dokumentum pillanatképe nem módosítható (%).', OLD."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "intake_document_snapshots_immutable"
BEFORE UPDATE ON "intake_document_snapshots"
FOR EACH ROW EXECUTE FUNCTION "intake_snapshot_immutable"();
