ALTER TABLE "owner_subscription"
  ADD COLUMN IF NOT EXISTS "complimentary_plan_code" "BillingPlanCode",
  ADD COLUMN IF NOT EXISTS "complimentary_months" INTEGER,
  ADD COLUMN IF NOT EXISTS "complimentary_starts_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "complimentary_ends_at" TIMESTAMP(3);
