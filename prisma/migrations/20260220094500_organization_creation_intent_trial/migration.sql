CREATE TYPE "OrganizationCreationIntentStatus" AS ENUM (
  'PENDING',
  'PAID',
  'FAILED',
  'EXPIRED',
  'CANCELED',
  'CHARGEBACK',
  'CONSUMING',
  'CONSUMED'
);

CREATE TYPE "OrganizationBillingCycle" AS ENUM ('MONTHLY', 'ANNUAL');

ALTER TABLE "user"
  ADD COLUMN "trial_consumed_at" TIMESTAMP(3);

CREATE TABLE "organization_creation_intent" (
  "id" TEXT NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "organization_id" TEXT,
  "status" "OrganizationCreationIntentStatus" NOT NULL DEFAULT 'PENDING',
  "company_name" TEXT NOT NULL,
  "company_slug" TEXT NOT NULL,
  "company_logo" TEXT,
  "target_plan_code" "BillingPlanCode" NOT NULL,
  "billing_cycle" "OrganizationBillingCycle" NOT NULL DEFAULT 'MONTHLY',
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "billing_name" TEXT NOT NULL,
  "billing_cellphone" TEXT NOT NULL,
  "billing_tax_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'abacatepay',
  "provider_billing_id" TEXT,
  "provider_external_id" TEXT NOT NULL,
  "checkout_url" TEXT,
  "checkout_status" "CheckoutStatus" NOT NULL DEFAULT 'PENDING',
  "paid_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "consumed_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_creation_intent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_creation_intent_organization_id_key"
  ON "organization_creation_intent"("organization_id");

CREATE UNIQUE INDEX "organization_creation_intent_provider_billing_id_key"
  ON "organization_creation_intent"("provider_billing_id");

CREATE UNIQUE INDEX "organization_creation_intent_provider_external_id_key"
  ON "organization_creation_intent"("provider_external_id");

CREATE INDEX "organization_creation_intent_owner_user_id_idx"
  ON "organization_creation_intent"("owner_user_id");

CREATE INDEX "organization_creation_intent_status_idx"
  ON "organization_creation_intent"("status");

CREATE INDEX "organization_creation_intent_owner_status_idx"
  ON "organization_creation_intent"("owner_user_id", "status");

ALTER TABLE "organization_creation_intent"
  ADD CONSTRAINT "organization_creation_intent_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "organization_creation_intent_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
