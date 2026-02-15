import { BillingPlanCode } from "@prisma/client";

export type PlanFeatureKey =
  | "team_invites"
  | "priority_support"
  | "advanced_analytics"
  | "bulk_product_actions"
  | "api_access";

export type PlanLimits = {
  maxOrganizations: number | null;
  maxUsers: number | null;
  maxProjects: number | null;
  maxMonthlyUsage: number | null;
};

export type PlanDefinition = {
  code: BillingPlanCode;
  name: string;
  description: string;
  monthlyPriceCents: number;
  limits: PlanLimits;
  features: PlanFeatureKey[];
};

export type PlanBillingCycle = "MONTHLY" | "ANNUAL";

export const FEATURE_LABELS: Record<PlanFeatureKey, string> = {
  team_invites: "Convites avançados de equipe",
  priority_support: "Suporte prioritário",
  advanced_analytics: "Analytics avançado",
  bulk_product_actions: "Ações em lote",
  api_access: "Acesso a API",
};

export const BILLING_PLANS: Record<BillingPlanCode, PlanDefinition> = {
  FREE: {
    code: "FREE",
    name: "Gratuito",
    description: "Ideal para uma organizacao em fase inicial.",
    monthlyPriceCents: 0,
    limits: {
      maxOrganizations: null,
      maxUsers: 1,
      maxProjects: null,
      maxMonthlyUsage: null,
    },
    features: [],
  },
  STARTER_50: {
    code: "STARTER_50",
    name: "Starter",
    description: "Ate 50 usuarios por organizacao.",
    monthlyPriceCents: 5_000,
    limits: {
      maxOrganizations: null,
      maxUsers: 50,
      maxProjects: null,
      maxMonthlyUsage: null,
    },
    features: ["team_invites", "bulk_product_actions"],
  },
  PRO_100: {
    code: "PRO_100",
    name: "Pro",
    description: "Ate 100 usuarios por organizacao.",
    monthlyPriceCents: 10_000,
    limits: {
      maxOrganizations: null,
      maxUsers: 100,
      maxProjects: null,
      maxMonthlyUsage: null,
    },
    features: [
      "team_invites",
      "bulk_product_actions",
      "advanced_analytics",
      "api_access",
    ],
  },
  SCALE_400: {
    code: "SCALE_400",
    name: "Scale",
    description: "Escala total com usuarios ilimitados por organizacao.",
    monthlyPriceCents: 40_000,
    limits: {
      maxOrganizations: null,
      maxUsers: null,
      maxProjects: null,
      maxMonthlyUsage: null,
    },
    features: [
      "team_invites",
      "bulk_product_actions",
      "advanced_analytics",
      "api_access",
      "priority_support",
    ],
  },
};

export const BILLING_PLAN_SEQUENCE: BillingPlanCode[] = [
  "FREE",
  "STARTER_50",
  "PRO_100",
  "SCALE_400",
];

export const ANNUAL_BILLING_DISCOUNT = 0.2;
export const MONTHS_PER_YEAR = 12;
export const DEFAULT_TRIAL_DAYS = 7;
export const DEFAULT_BILLING_PERIOD_DAYS = 30;
export const DEFAULT_ANNUAL_BILLING_PERIOD_DAYS = 365;

export function getPlanDefinition(planCode: BillingPlanCode): PlanDefinition {
  return BILLING_PLANS[planCode];
}

export function formatBrlFromCents(valueCents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(valueCents / 100);
}

export function isPaidPlan(planCode: BillingPlanCode): boolean {
  return planCode !== "FREE";
}

export function getAnnualPricing(monthlyPriceCents: number): {
  annualTotalCents: number;
  monthlyEquivalentCents: number;
} {
  const annualTotalCents = Math.round(
    monthlyPriceCents * MONTHS_PER_YEAR * (1 - ANNUAL_BILLING_DISCOUNT),
  );
  const monthlyEquivalentCents = Math.round(annualTotalCents / MONTHS_PER_YEAR);

  return {
    annualTotalCents,
    monthlyEquivalentCents,
  };
}

export function getPlanChargeCents(
  monthlyPriceCents: number,
  billingCycle: PlanBillingCycle,
): number {
  if (billingCycle === "ANNUAL") {
    return getAnnualPricing(monthlyPriceCents).annualTotalCents;
  }

  return monthlyPriceCents;
}

export function getBillingPeriodDays(billingCycle: PlanBillingCycle): number {
  return billingCycle === "ANNUAL"
    ? DEFAULT_ANNUAL_BILLING_PERIOD_DAYS
    : DEFAULT_BILLING_PERIOD_DAYS;
}

export function toPlanCode(value: string | null | undefined): BillingPlanCode {
  if (value === "STARTER_50" || value === "PRO_100" || value === "SCALE_400") {
    return value;
  }

  return "FREE";
}

export function isUnlimitedLimit(value: number | null): boolean {
  return value === null;
}
