CREATE TYPE "PlatformAdminRole" AS ENUM ('MASTER', 'ADMIN');
CREATE TYPE "PlatformAdminStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "PlatformOrgStatus" AS ENUM ('ACTIVE', 'BLOCKED');
CREATE TYPE "PlatformUserStatus" AS ENUM ('ACTIVE', 'BLOCKED');
CREATE TYPE "PlatformEventSeverity" AS ENUM ('INFO', 'WARN', 'ERROR');

ALTER TABLE "organization"
  ADD COLUMN "platform_status" "PlatformOrgStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "platform_blocked_at" TIMESTAMP(3),
  ADD COLUMN "platform_blocked_reason" TEXT,
  ADD COLUMN "platform_blocked_by_admin_id" TEXT;

ALTER TABLE "user"
  ADD COLUMN "platform_status" "PlatformUserStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "platform_blocked_at" TIMESTAMP(3),
  ADD COLUMN "platform_blocked_reason" TEXT,
  ADD COLUMN "platform_blocked_by_admin_id" TEXT;

CREATE TABLE "platform_admin" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role" "PlatformAdminRole" NOT NULL DEFAULT 'ADMIN',
  "status" "PlatformAdminStatus" NOT NULL DEFAULT 'ACTIVE',
  "must_change_password" BOOLEAN NOT NULL DEFAULT false,
  "created_by_admin_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_admin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_admin_user_id_key" ON "platform_admin"("user_id");
CREATE INDEX "platform_admin_role_idx" ON "platform_admin"("role");
CREATE INDEX "platform_admin_status_idx" ON "platform_admin"("status");

CREATE TABLE "platform_event_log" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "severity" "PlatformEventSeverity" NOT NULL DEFAULT 'INFO',
  "actor_user_id" TEXT,
  "actor_admin_id" TEXT,
  "organization_id" TEXT,
  "target_type" TEXT NOT NULL,
  "target_id" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_event_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_event_log_created_at_idx" ON "platform_event_log"("created_at");
CREATE INDEX "platform_event_log_source_idx" ON "platform_event_log"("source");
CREATE INDEX "platform_event_log_action_idx" ON "platform_event_log"("action");
CREATE INDEX "platform_event_log_organization_id_idx" ON "platform_event_log"("organization_id");
CREATE INDEX "platform_event_log_target_type_target_id_idx" ON "platform_event_log"("target_type", "target_id");
CREATE INDEX "platform_event_log_actor_user_id_idx" ON "platform_event_log"("actor_user_id");
CREATE INDEX "platform_event_log_actor_admin_id_idx" ON "platform_event_log"("actor_admin_id");

ALTER TABLE "platform_admin"
  ADD CONSTRAINT "platform_admin_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "platform_admin_created_by_admin_id_fkey"
    FOREIGN KEY ("created_by_admin_id") REFERENCES "platform_admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "organization"
  ADD CONSTRAINT "organization_platform_blocked_by_admin_id_fkey"
    FOREIGN KEY ("platform_blocked_by_admin_id") REFERENCES "platform_admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user"
  ADD CONSTRAINT "user_platform_blocked_by_admin_id_fkey"
    FOREIGN KEY ("platform_blocked_by_admin_id") REFERENCES "platform_admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "platform_event_log"
  ADD CONSTRAINT "platform_event_log_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "platform_event_log_actor_admin_id_fkey"
    FOREIGN KEY ("actor_admin_id") REFERENCES "platform_admin"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "platform_event_log_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
