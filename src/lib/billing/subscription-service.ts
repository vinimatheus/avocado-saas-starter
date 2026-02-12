import { randomUUID, createHash } from "node:crypto";

import {
  BillingPlanCode,
  CheckoutStatus,
  OwnerSubscription,
  Prisma,
  SubscriptionStatus,
  WebhookProcessingStatus,
} from "@prisma/client";

import {
  type AbacateBilling,
  createAbacateBilling,
  createAbacateCustomer,
  isAbacatePayConfigured,
  isTrustedAbacateCheckoutUrl,
  listAbacateBillings,
} from "@/lib/billing/abacatepay";
import {
  BILLING_PLAN_SEQUENCE,
  DEFAULT_TRIAL_DAYS,
  FEATURE_LABELS,
  type PlanBillingCycle,
  type PlanFeatureKey,
  getBillingPeriodDays,
  getPlanChargeCents,
  getPlanDefinition,
  isPaidPlan,
} from "@/lib/billing/plans";
import { prisma } from "@/lib/db/prisma";
import {
  DEFAULT_APP_BASE_URL,
  resolveExplicitAppBaseUrlFromEnv,
  resolveVercelAppBaseUrlFromEnv,
} from "@/lib/env/app-base-url";

export const DEFAULT_USAGE_METRIC_KEY = "workspace_events";
export const DEFAULT_PAST_DUE_GRACE_DAYS = 28;
const PAST_DUE_REMINDER_DAYS = [7, 14, 21] as const;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

type OwnerUsageSnapshot = {
  organizations: number;
  users: number;
  pendingInvitations: number;
  projects: number;
  monthlyUsage: number;
};

type DunningReminderCheckpoint = (typeof PAST_DUE_REMINDER_DAYS)[number] | null;

type OwnerDunningState = {
  inGracePeriod: boolean;
  graceStartedAt: Date | null;
  graceEndsAt: Date | null;
  daysInGracePeriod: number | null;
  daysUntilDowngrade: number | null;
  reminderCheckpointDay: DunningReminderCheckpoint;
};

type OwnerRestrictionState = {
  isRestricted: boolean;
  exceededOrganizations: number;
  exceededUsers: number;
};

export type OwnerEntitlements = {
  ownerUserId: string;
  subscription: OwnerSubscription;
  effectivePlanCode: BillingPlanCode;
  usage: OwnerUsageSnapshot;
  dunning: OwnerDunningState;
  restriction: OwnerRestrictionState;
};

export type OwnerFeatureStatus = {
  key: PlanFeatureKey;
  label: string;
  enabled: boolean;
  source: "override" | "plan" | "rollout" | "disabled";
};

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function isPlanBillingCycle(value: unknown): value is PlanBillingCycle {
  return value === "MONTHLY" || value === "ANNUAL";
}

function resolveCheckoutBillingCycle(metadata: Prisma.JsonValue | null | undefined): PlanBillingCycle {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "MONTHLY";
  }

  const cycle = (metadata as Record<string, unknown>).billingCycle;
  return isPlanBillingCycle(cycle) ? cycle : "MONTHLY";
}

function startOfUtcMonth(referenceDate: Date = new Date()): Date {
  return new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1, 0, 0, 0, 0));
}

function getAppBaseUrl(): string {
  const explicitBaseUrl = resolveExplicitAppBaseUrlFromEnv();
  if (explicitBaseUrl.origin) {
    return explicitBaseUrl.origin;
  }

  const vercelBaseUrl = resolveVercelAppBaseUrlFromEnv();
  if (vercelBaseUrl) {
    return vercelBaseUrl;
  }

  return DEFAULT_APP_BASE_URL;
}

function mapBillingStatus(status: string): CheckoutStatus {
  if (status === "PAID") {
    return CheckoutStatus.PAID;
  }

  if (status === "EXPIRED") {
    return CheckoutStatus.EXPIRED;
  }

  if (status === "CANCELLED") {
    return CheckoutStatus.CANCELED;
  }

  if (status === "REFUNDED") {
    return CheckoutStatus.CHARGEBACK;
  }

  return CheckoutStatus.PENDING;
}

function billingStatusToOutcome(status: string): CheckoutStatus | null {
  if (status === "PAID") {
    return CheckoutStatus.PAID;
  }

  if (status === "EXPIRED") {
    return CheckoutStatus.EXPIRED;
  }

  if (status === "CANCELLED") {
    return CheckoutStatus.FAILED;
  }

  if (status === "REFUNDED") {
    return CheckoutStatus.CHARGEBACK;
  }

  return null;
}

function isCheckoutFinalStatus(status: CheckoutStatus): boolean {
  return (
    status === CheckoutStatus.PAID ||
    status === CheckoutStatus.FAILED ||
    status === CheckoutStatus.EXPIRED ||
    status === CheckoutStatus.CANCELED ||
    status === CheckoutStatus.CHARGEBACK
  );
}

function nowInPeriod(days: number): { start: Date; end: Date } {
  const start = new Date();
  const end = addDays(start, days);

  return {
    start,
    end,
  };
}

function nowInPastDueGracePeriod(): { start: Date; end: Date } {
  return nowInPeriod(DEFAULT_PAST_DUE_GRACE_DAYS);
}

function resolveDunningCheckpoint(daysInGracePeriod: number): DunningReminderCheckpoint {
  for (let index = PAST_DUE_REMINDER_DAYS.length - 1; index >= 0; index -= 1) {
    const checkpoint = PAST_DUE_REMINDER_DAYS[index];
    if (daysInGracePeriod >= checkpoint) {
      return checkpoint;
    }
  }

  return null;
}

function buildOwnerDunningState(subscription: OwnerSubscription): OwnerDunningState {
  const now = new Date();

  if (subscription.status !== SubscriptionStatus.PAST_DUE || !subscription.currentPeriodEnd) {
    return {
      inGracePeriod: false,
      graceStartedAt: null,
      graceEndsAt: null,
      daysInGracePeriod: null,
      daysUntilDowngrade: null,
      reminderCheckpointDay: null,
    };
  }

  const graceEndsAt = subscription.currentPeriodEnd;
  const inGracePeriod = graceEndsAt.getTime() > now.getTime();
  const daysUntilDowngrade = inGracePeriod
    ? Math.max(0, Math.ceil((graceEndsAt.getTime() - now.getTime()) / DAY_IN_MS))
    : 0;

  const graceStartedAt =
    subscription.currentPeriodStart && subscription.currentPeriodStart < graceEndsAt
      ? subscription.currentPeriodStart
      : null;

  const inferredDaysInGrace =
    graceStartedAt !== null
      ? Math.max(0, Math.floor((now.getTime() - graceStartedAt.getTime()) / DAY_IN_MS))
      : Math.max(0, DEFAULT_PAST_DUE_GRACE_DAYS - daysUntilDowngrade);

  return {
    inGracePeriod,
    graceStartedAt,
    graceEndsAt,
    daysInGracePeriod: inferredDaysInGrace,
    daysUntilDowngrade,
    reminderCheckpointDay: resolveDunningCheckpoint(inferredDaysInGrace),
  };
}

function buildOwnerRestrictionState(
  effectivePlanCode: BillingPlanCode,
  usage: OwnerUsageSnapshot,
): OwnerRestrictionState {
  const effectivePlan = getPlanDefinition(effectivePlanCode);
  const usedSeats = usage.users + usage.pendingInvitations;

  const exceededOrganizations =
    effectivePlan.limits.maxOrganizations === null
      ? 0
      : Math.max(0, usage.organizations - effectivePlan.limits.maxOrganizations);

  const exceededUsers =
    effectivePlan.limits.maxUsers === null
      ? 0
      : Math.max(0, usedSeats - effectivePlan.limits.maxUsers);

  return {
    isRestricted: exceededOrganizations > 0 || exceededUsers > 0,
    exceededOrganizations,
    exceededUsers,
  };
}

async function listOwnedOrganizationIds(ownerUserId: string): Promise<string[]> {
  const memberships = await prisma.member.findMany({
    where: {
      userId: ownerUserId,
      role: {
        contains: "owner",
      },
    },
    select: {
      organizationId: true,
    },
  });

  return memberships.map((membership) => membership.organizationId);
}

async function getOwnerUsageSnapshot(
  ownerUserId: string,
  metricKey: string = DEFAULT_USAGE_METRIC_KEY,
): Promise<OwnerUsageSnapshot> {
  const organizationIds = await listOwnedOrganizationIds(ownerUserId);

  if (organizationIds.length === 0) {
    const monthlyUsageResult = await prisma.ownerMonthlyUsage.aggregate({
      where: {
        ownerUserId,
        metricKey,
        periodStart: startOfUtcMonth(),
      },
      _sum: {
        value: true,
      },
    });

    return {
      organizations: 0,
      users: 0,
      pendingInvitations: 0,
      projects: 0,
      monthlyUsage: monthlyUsageResult._sum.value ?? 0,
    };
  }

  const [users, pendingInvitations, projects, monthlyUsageResult] = await Promise.all([
    prisma.member.count({
      where: {
        organizationId: {
          in: organizationIds,
        },
      },
    }),
    prisma.invitation.count({
      where: {
        organizationId: {
          in: organizationIds,
        },
        status: "pending",
      },
    }),
    prisma.product.count({
      where: {
        organizationId: {
          in: organizationIds,
        },
      },
    }),
    prisma.ownerMonthlyUsage.aggregate({
      where: {
        ownerUserId,
        metricKey,
        periodStart: startOfUtcMonth(),
      },
      _sum: {
        value: true,
      },
    }),
  ]);

  return {
    organizations: organizationIds.length,
    users,
    pendingInvitations,
    projects,
    monthlyUsage: monthlyUsageResult._sum.value ?? 0,
  };
}

async function getOwnerBasicProfile(ownerUserId: string): Promise<{ name: string | null; email: string | null }> {
  const user = await prisma.user.findUnique({
    where: {
      id: ownerUserId,
    },
    select: {
      name: true,
      email: true,
    },
  });

  return {
    name: user?.name?.trim() || null,
    email: user?.email || null,
  };
}

async function setSubscriptionAsExpiredIfNeeded(
  subscription: OwnerSubscription,
): Promise<OwnerSubscription> {
  const now = new Date();

  if (
    subscription.status === SubscriptionStatus.TRIALING &&
    subscription.trialEndsAt &&
    subscription.trialEndsAt <= now
  ) {
    return prisma.ownerSubscription.update({
      where: {
        ownerUserId: subscription.ownerUserId,
      },
      data: {
        status: SubscriptionStatus.FREE,
        planCode: BillingPlanCode.FREE,
        pendingPlanCode: null,
        trialPlanCode: null,
      },
    });
  }

  if (
    subscription.status === SubscriptionStatus.ACTIVE &&
    subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd <= now
  ) {
    if (subscription.cancelAtPeriodEnd) {
      return prisma.ownerSubscription.update({
        where: {
          ownerUserId: subscription.ownerUserId,
        },
        data: {
          status: SubscriptionStatus.CANCELED,
          planCode: BillingPlanCode.FREE,
          pendingPlanCode: null,
          canceledAt: now,
        },
      });
    }

    const gracePeriod = nowInPastDueGracePeriod();

    return prisma.ownerSubscription.update({
      where: {
        ownerUserId: subscription.ownerUserId,
      },
      data: {
        status: SubscriptionStatus.PAST_DUE,
        pendingPlanCode: null,
        currentPeriodStart: gracePeriod.start,
        currentPeriodEnd: gracePeriod.end,
        cancelAtPeriodEnd: false,
        canceledAt: null,
      },
    });
  }

  if (
    subscription.status === SubscriptionStatus.PAST_DUE &&
    (!subscription.currentPeriodEnd || subscription.currentPeriodEnd <= now)
  ) {
    return prisma.ownerSubscription.update({
      where: {
        ownerUserId: subscription.ownerUserId,
      },
      data: {
        status: SubscriptionStatus.EXPIRED,
        planCode: BillingPlanCode.FREE,
        pendingPlanCode: null,
        canceledAt: now,
      },
    });
  }

  return subscription;
}

export async function resolveOrganizationPrimaryOwnerUserId(
  organizationId: string,
): Promise<string | null> {
  const ownerMembership = await prisma.member.findFirst({
    where: {
      organizationId,
      role: {
        contains: "owner",
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      userId: true,
    },
  });

  if (ownerMembership) {
    return ownerMembership.userId;
  }

  const fallbackMembership = await prisma.member.findFirst({
    where: {
      organizationId,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      userId: true,
    },
  });

  return fallbackMembership?.userId ?? null;
}

export async function ensureOwnerSubscription(
  ownerUserId: string,
): Promise<OwnerSubscription> {
  const basicProfile = await getOwnerBasicProfile(ownerUserId);

  return prisma.ownerSubscription.upsert({
    where: {
      ownerUserId,
    },
    create: {
      ownerUserId,
      status: SubscriptionStatus.FREE,
      planCode: BillingPlanCode.FREE,
      billingName: basicProfile.name,
    },
    update: basicProfile.name
      ? {
          billingName: basicProfile.name,
        }
      : {},
  });
}

function resolveEffectivePlanCode(subscription: OwnerSubscription): BillingPlanCode {
  const now = new Date();

  if (
    subscription.status === SubscriptionStatus.TRIALING &&
    subscription.trialPlanCode &&
    subscription.trialEndsAt &&
    subscription.trialEndsAt > now
  ) {
    return subscription.trialPlanCode;
  }

  if (
    subscription.status === SubscriptionStatus.ACTIVE &&
    subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd > now
  ) {
    return subscription.planCode;
  }

  if (
    subscription.status === SubscriptionStatus.PAST_DUE &&
    subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd > now &&
    isPaidPlan(subscription.planCode)
  ) {
    return subscription.planCode;
  }

  if (subscription.status === SubscriptionStatus.FREE) {
    return BillingPlanCode.FREE;
  }

  return BillingPlanCode.FREE;
}

export async function getOwnerEntitlements(
  ownerUserId: string,
  metricKey: string = DEFAULT_USAGE_METRIC_KEY,
): Promise<OwnerEntitlements> {
  const subscription = await ensureOwnerSubscription(ownerUserId);
  const syncedSubscription = await setSubscriptionAsExpiredIfNeeded(subscription);

  const [effectivePlanCode, usage] = await Promise.all([
    Promise.resolve(resolveEffectivePlanCode(syncedSubscription)),
    getOwnerUsageSnapshot(ownerUserId, metricKey),
  ]);

  const dunning = buildOwnerDunningState(syncedSubscription);
  const restriction = buildOwnerRestrictionState(effectivePlanCode, usage);

  return {
    ownerUserId,
    subscription: syncedSubscription,
    effectivePlanCode,
    usage,
    dunning,
    restriction,
  };
}

function buildLimitErrorMessage(limitLabel: string, currentValue: number, maxAllowed: number): string {
  return `Limite do plano atingido para ${limitLabel} (${currentValue}/${maxAllowed}). Faça upgrade para continuar.`;
}

function buildRestrictionErrorMessage(restriction: OwnerRestrictionState): string {
  const exceeded: string[] = [];

  if (restriction.exceededOrganizations > 0) {
    exceeded.push(`${restriction.exceededOrganizations} organização(ões) acima do limite`);
  }

  if (restriction.exceededUsers > 0) {
    exceeded.push(`${restriction.exceededUsers} usuário(s) acima do limite`);
  }

  const detail = exceeded.length > 0 ? ` (${exceeded.join(", ")}).` : ".";
  return `Conta em modo restrito no plano atual${detail} Faça upgrade ou reduza os excedentes para voltar a operar.`;
}

function assertNotRestricted(entitlements: OwnerEntitlements): void {
  if (!entitlements.restriction.isRestricted) {
    return;
  }

  throw new Error(buildRestrictionErrorMessage(entitlements.restriction));
}

export async function assertOwnerCanCreateOrganization(ownerUserId: string): Promise<void> {
  const entitlements = await getOwnerEntitlements(ownerUserId);
  const plan = getPlanDefinition(entitlements.effectivePlanCode);
  const maxAllowed = plan.limits.maxOrganizations;

  if (maxAllowed === null) {
    return;
  }

  if (entitlements.usage.organizations >= maxAllowed) {
    throw new Error(
      buildLimitErrorMessage("organizações", entitlements.usage.organizations, maxAllowed),
    );
  }
}

export async function assertOrganizationCanCreateInvitation(
  organizationId: string,
  email: string,
): Promise<void> {
  const ownerUserId = await resolveOrganizationPrimaryOwnerUserId(organizationId);
  if (!ownerUserId) {
    return;
  }

  const existingPendingInvitation = await prisma.invitation.findFirst({
    where: {
      organizationId,
      email: email.toLowerCase(),
      status: "pending",
    },
    select: {
      id: true,
    },
  });

  if (existingPendingInvitation) {
    return;
  }

  const entitlements = await getOwnerEntitlements(ownerUserId);
  const plan = getPlanDefinition(entitlements.effectivePlanCode);
  const maxAllowed = plan.limits.maxUsers;

  if (maxAllowed === null) {
    return;
  }

  const reservedSeats = entitlements.usage.users + entitlements.usage.pendingInvitations;
  if (reservedSeats + 1 > maxAllowed) {
    throw new Error(buildLimitErrorMessage("usuários", reservedSeats, maxAllowed));
  }
}

export async function assertOrganizationCanAddMember(
  organizationId: string,
  targetUserId?: string,
): Promise<void> {
  const ownerUserId = await resolveOrganizationPrimaryOwnerUserId(organizationId);
  if (!ownerUserId) {
    return;
  }

  const entitlements = await getOwnerEntitlements(ownerUserId);
  const plan = getPlanDefinition(entitlements.effectivePlanCode);
  const maxAllowed = plan.limits.maxUsers;

  if (maxAllowed === null) {
    return;
  }

  const reservedSeats = entitlements.usage.users + entitlements.usage.pendingInvitations;
  let additionalSeats = 1;

  if (targetUserId) {
    const targetUser = await prisma.user.findUnique({
      where: {
        id: targetUserId,
      },
      select: {
        email: true,
      },
    });

    if (targetUser?.email) {
      const hasPendingInvitation = await prisma.invitation.findFirst({
        where: {
          organizationId,
          email: targetUser.email.toLowerCase(),
          status: "pending",
        },
        select: {
          id: true,
        },
      });

      if (hasPendingInvitation) {
        additionalSeats = 0;
      }
    }
  }

  if (reservedSeats + additionalSeats > maxAllowed) {
    throw new Error(buildLimitErrorMessage("usuários", reservedSeats, maxAllowed));
  }
}

export async function assertOrganizationCanAcceptInvitation(
  organizationId: string,
  invitationId: string,
): Promise<void> {
  const ownerUserId = await resolveOrganizationPrimaryOwnerUserId(organizationId);
  if (!ownerUserId) {
    return;
  }

  const entitlements = await getOwnerEntitlements(ownerUserId);
  const plan = getPlanDefinition(entitlements.effectivePlanCode);
  const maxAllowed = plan.limits.maxUsers;

  if (maxAllowed === null) {
    return;
  }

  const invitation = await prisma.invitation.findUnique({
    where: {
      id: invitationId,
    },
    select: {
      status: true,
    },
  });

  const reservedSeats = entitlements.usage.users + entitlements.usage.pendingInvitations;
  const projectedSeats = invitation?.status === "pending" ? reservedSeats : reservedSeats + 1;

  if (projectedSeats > maxAllowed) {
    throw new Error(buildLimitErrorMessage("usuários", projectedSeats, maxAllowed));
  }
}

export async function assertOrganizationCanCreateProject(
  organizationId: string,
  increment: number = 1,
): Promise<void> {
  const ownerUserId = await resolveOrganizationPrimaryOwnerUserId(organizationId);
  if (!ownerUserId) {
    return;
  }

  const entitlements = await getOwnerEntitlements(ownerUserId);
  assertNotRestricted(entitlements);
  const plan = getPlanDefinition(entitlements.effectivePlanCode);
  const maxAllowed = plan.limits.maxProjects;

  if (maxAllowed === null) {
    return;
  }

  if (entitlements.usage.projects + increment > maxAllowed) {
    throw new Error(
      buildLimitErrorMessage("projetos", entitlements.usage.projects, maxAllowed),
    );
  }
}

export async function assertOrganizationCanConsumeMonthlyUsage(
  organizationId: string,
  increment: number = 1,
  metricKey: string = DEFAULT_USAGE_METRIC_KEY,
): Promise<void> {
  const ownerUserId = await resolveOrganizationPrimaryOwnerUserId(organizationId);
  if (!ownerUserId) {
    return;
  }

  const entitlements = await getOwnerEntitlements(ownerUserId, metricKey);
  assertNotRestricted(entitlements);
  const plan = getPlanDefinition(entitlements.effectivePlanCode);
  const maxAllowed = plan.limits.maxMonthlyUsage;

  if (maxAllowed === null) {
    return;
  }

  if (entitlements.usage.monthlyUsage + increment > maxAllowed) {
    throw new Error(
      buildLimitErrorMessage("uso mensal", entitlements.usage.monthlyUsage, maxAllowed),
    );
  }
}

export async function consumeOrganizationMonthlyUsage(input: {
  organizationId: string;
  increment: number;
  metricKey?: string;
}): Promise<void> {
  const ownerUserId = await resolveOrganizationPrimaryOwnerUserId(input.organizationId);
  if (!ownerUserId) {
    return;
  }

  const periodStart = startOfUtcMonth();

  await prisma.ownerMonthlyUsage.upsert({
    where: {
      ownerUserId_organizationId_metricKey_periodStart: {
        ownerUserId,
        organizationId: input.organizationId,
        metricKey: input.metricKey ?? DEFAULT_USAGE_METRIC_KEY,
        periodStart,
      },
    },
    create: {
      ownerUserId,
      organizationId: input.organizationId,
      metricKey: input.metricKey ?? DEFAULT_USAGE_METRIC_KEY,
      periodStart,
      value: input.increment,
    },
    update: {
      value: {
        increment: input.increment,
      },
    },
  });
}

export async function updateOwnerBillingProfile(
  ownerUserId: string,
  input: {
    billingName: string;
    billingCellphone: string;
    billingTaxId: string;
  },
): Promise<OwnerSubscription> {
  await ensureOwnerSubscription(ownerUserId);

  return prisma.ownerSubscription.update({
    where: {
      ownerUserId,
    },
    data: {
      billingName: input.billingName.trim(),
      billingCellphone: input.billingCellphone.trim(),
      billingTaxId: input.billingTaxId.trim(),
    },
  });
}

export async function startOwnerTrial(
  ownerUserId: string,
  trialPlanCode: BillingPlanCode,
): Promise<OwnerSubscription> {
  if (!isPaidPlan(trialPlanCode)) {
    throw new Error("Trial disponivel apenas para planos pagos.");
  }

  const subscription = await ensureOwnerSubscription(ownerUserId);
  const now = new Date();

  if (
    subscription.status === SubscriptionStatus.TRIALING &&
    subscription.trialEndsAt &&
    subscription.trialEndsAt > now
  ) {
    throw new Error("Já existe um trial ativo para esta conta.");
  }

  if (subscription.trialUsedAt) {
    throw new Error("Trial já utilizado anteriormente nesta conta.");
  }

  return prisma.ownerSubscription.update({
    where: {
      ownerUserId,
    },
    data: {
      status: SubscriptionStatus.TRIALING,
      trialPlanCode,
      trialStartedAt: now,
      trialEndsAt: addDays(now, DEFAULT_TRIAL_DAYS),
      trialUsedAt: now,
      cancelAtPeriodEnd: false,
      canceledAt: null,
    },
  });
}

export async function cancelOwnerSubscription(
  ownerUserId: string,
  immediate: boolean,
): Promise<OwnerSubscription> {
  const subscription = await ensureOwnerSubscription(ownerUserId);

  if (immediate || subscription.status === SubscriptionStatus.TRIALING) {
    return prisma.ownerSubscription.update({
      where: {
        ownerUserId,
      },
      data: {
        status: SubscriptionStatus.CANCELED,
        planCode: BillingPlanCode.FREE,
        pendingPlanCode: null,
        trialPlanCode: null,
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: true,
        canceledAt: new Date(),
      },
    });
  }

  return prisma.ownerSubscription.update({
    where: {
      ownerUserId,
    },
    data: {
      cancelAtPeriodEnd: true,
      canceledAt: new Date(),
    },
  });
}

export async function reactivateOwnerSubscription(ownerUserId: string): Promise<OwnerSubscription> {
  const subscription = await ensureOwnerSubscription(ownerUserId);

  if (
    subscription.status === SubscriptionStatus.ACTIVE &&
    subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd > new Date()
  ) {
    return prisma.ownerSubscription.update({
      where: {
        ownerUserId,
      },
      data: {
        cancelAtPeriodEnd: false,
        canceledAt: null,
      },
    });
  }

  if (
    subscription.status === SubscriptionStatus.TRIALING &&
    subscription.trialEndsAt &&
    subscription.trialEndsAt > new Date()
  ) {
    return prisma.ownerSubscription.update({
      where: {
        ownerUserId,
      },
      data: {
        cancelAtPeriodEnd: false,
        canceledAt: null,
      },
    });
  }

  throw new Error("Não há assinatura ativa para reativar. Selecione um plano para continuar.");
}

async function ensureAbacateCustomerId(subscription: OwnerSubscription): Promise<string> {
  if (subscription.abacateCustomerId) {
    return subscription.abacateCustomerId;
  }

  if (!subscription.billingName || !subscription.billingCellphone || !subscription.billingTaxId) {
    throw new Error("Preencha nome, telefone e CPF/CNPJ de faturamento para continuar.");
  }

  const ownerProfile = await getOwnerBasicProfile(subscription.ownerUserId);
  if (!ownerProfile.email) {
    throw new Error("Usuário sem e-mail válido para criar cliente no AbacatePay.");
  }

  const customer = await createAbacateCustomer({
    name: subscription.billingName,
    cellphone: subscription.billingCellphone,
    email: ownerProfile.email,
    taxId: subscription.billingTaxId,
  });

  await prisma.ownerSubscription.update({
    where: {
      ownerUserId: subscription.ownerUserId,
    },
    data: {
      abacateCustomerId: customer.id,
    },
  });

  return customer.id;
}

export async function createPlanCheckoutSession(input: {
  ownerUserId: string;
  targetPlanCode: BillingPlanCode;
  billingCycle?: PlanBillingCycle;
  organizationId?: string | null;
  allowSamePlan?: boolean;
}): Promise<{ checkoutUrl: string; checkoutId: string }> {
  if (!isPaidPlan(input.targetPlanCode)) {
    throw new Error("Selecione um plano pago para iniciar checkout.");
  }

  if (!isAbacatePayConfigured()) {
    throw new Error("ABACATEPAY_API_KEY não configurada para gerar checkout.");
  }

  const subscription = await ensureOwnerSubscription(input.ownerUserId);
  const currentEntitlements = await getOwnerEntitlements(input.ownerUserId);

  if (!input.allowSamePlan && currentEntitlements.effectivePlanCode === input.targetPlanCode) {
    throw new Error("Este já é o plano ativo da conta.");
  }

  const targetPlan = getPlanDefinition(input.targetPlanCode);
  const billingCycle = input.billingCycle ?? "MONTHLY";
  const billingPeriodDays = getBillingPeriodDays(billingCycle);
  const amountCents = getPlanChargeCents(targetPlan.monthlyPriceCents, billingCycle);
  const customerId = await ensureAbacateCustomerId(subscription);
  const billingFrequency = billingCycle === "ANNUAL" ? "ONE_TIME" : "MULTIPLE_PAYMENTS";
  const cycleLabel = billingCycle === "ANNUAL" ? "Anual" : "Mensal";
  const cycleDescription =
    billingCycle === "ANNUAL"
      ? `Assinatura anual do ${targetPlan.name} com 20% de desconto`
      : `Assinatura mensal do ${targetPlan.name}`;

  const externalId = `checkout_${randomUUID().replaceAll("-", "")}`;
  const checkout = await prisma.billingCheckoutSession.create({
    data: {
      ownerUserId: input.ownerUserId,
      subscriptionId: subscription.id,
      organizationId: input.organizationId ?? null,
      targetPlanCode: input.targetPlanCode,
      amountCents,
      metadata: {
        billingCycle,
        billingPeriodDays,
      },
      providerExternalId: externalId,
      status: CheckoutStatus.PENDING,
    },
  });

  const appBaseUrl = getAppBaseUrl();

  try {
    const billing = await createAbacateBilling({
      frequency: billingFrequency,
      methods: ["PIX", "CARD"],
      products: [
        {
          externalId,
          name: `${targetPlan.name} - ${cycleLabel}`,
          description: cycleDescription,
          quantity: 1,
          price: amountCents,
        },
      ],
      returnUrl: `${appBaseUrl}/billing`,
      completionUrl: `${appBaseUrl}/billing?checkout=${checkout.id}`,
      customerId,
      externalId,
      metadata: {
        ownerUserId: input.ownerUserId,
        checkoutId: checkout.id,
        targetPlanCode: input.targetPlanCode,
        billingCycle,
        billingPeriodDays,
      },
    });

    if (!isTrustedAbacateCheckoutUrl(billing.url)) {
      throw new Error("URL de checkout retornada pelo provedor não é confiável.");
    }

    await prisma.$transaction([
      prisma.billingCheckoutSession.update({
        where: {
          id: checkout.id,
        },
        data: {
          abacateBillingId: billing.id,
          abacateBillingUrl: billing.url,
          status: mapBillingStatus(billing.status),
        },
      }),
      prisma.ownerSubscription.update({
        where: {
          ownerUserId: input.ownerUserId,
        },
        data: {
          pendingPlanCode: input.targetPlanCode,
        },
      }),
      prisma.billingInvoice.create({
        data: {
          ownerUserId: input.ownerUserId,
          subscriptionId: subscription.id,
          checkoutSessionId: checkout.id,
          providerBillingId: billing.id,
          status: mapBillingStatus(billing.status),
          amountCents,
          billingUrl: billing.url,
        },
      }),
    ]);

    return {
      checkoutUrl: billing.url,
      checkoutId: checkout.id,
    };
  } catch (error) {
    await prisma.billingCheckoutSession.update({
      where: {
        id: checkout.id,
      },
      data: {
        status: CheckoutStatus.FAILED,
      },
    });

    throw error;
  }
}

export async function applyFreeDowngrade(ownerUserId: string): Promise<OwnerSubscription> {
  await ensureOwnerSubscription(ownerUserId);

  return prisma.ownerSubscription.update({
    where: {
      ownerUserId,
    },
    data: {
      status: SubscriptionStatus.FREE,
      planCode: BillingPlanCode.FREE,
      pendingPlanCode: null,
      trialPlanCode: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: new Date(),
    },
  });
}

export async function listOwnerInvoices(ownerUserId: string) {
  const subscription = await ensureOwnerSubscription(ownerUserId);

  return prisma.billingInvoice.findMany({
    where: {
      ownerUserId,
      subscriptionId: subscription.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
  });
}

async function syncInvoiceFromBilling(
  ownerUserId: string,
  subscriptionId: string,
  checkoutLookup: Map<string, { id: string; amountCents: number }>,
  billing: AbacateBilling,
): Promise<void> {
  const externalIds = billing.products
    .map((product) => product.externalId)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  const checkoutByExternal = externalIds
    .map((externalId) => checkoutLookup.get(externalId))
    .find((value) => Boolean(value));

  const checkoutByBillingId = await prisma.billingCheckoutSession.findFirst({
    where: {
      ownerUserId,
      abacateBillingId: billing.id,
    },
    select: {
      id: true,
      amountCents: true,
    },
  });

  const checkout = checkoutByExternal ?? checkoutByBillingId;

  if (!checkout) {
    return;
  }

  await prisma.billingInvoice.upsert({
    where: {
      providerBillingId: billing.id,
    },
    create: {
      ownerUserId,
      subscriptionId,
      checkoutSessionId: checkout.id,
      providerBillingId: billing.id,
      status: mapBillingStatus(billing.status),
      amountCents: checkout.amountCents,
      billingUrl: billing.url,
    },
    update: {
      checkoutSessionId: checkout.id,
      status: mapBillingStatus(billing.status),
      billingUrl: billing.url,
    },
  });
}

export async function syncOwnerInvoicesFromAbacate(ownerUserId: string): Promise<void> {
  if (!isAbacatePayConfigured()) {
    return;
  }

  const subscription = await ensureOwnerSubscription(ownerUserId);
  const checkouts = await prisma.billingCheckoutSession.findMany({
    where: {
      ownerUserId,
    },
    select: {
      id: true,
      amountCents: true,
      providerExternalId: true,
    },
    take: 200,
  });

  const checkoutLookup = new Map(
    checkouts.map((checkout) => [checkout.providerExternalId, { id: checkout.id, amountCents: checkout.amountCents }]),
  );

  const billings = await listAbacateBillings();

  for (const billing of billings) {
    await syncInvoiceFromBilling(ownerUserId, subscription.id, checkoutLookup, billing);
  }
}

type CheckoutReconcileTarget = {
  id: string;
  ownerUserId: string;
  subscriptionId: string;
  targetPlanCode: BillingPlanCode;
  amountCents: number;
  currency: string;
  providerExternalId: string;
  abacateBillingId: string | null;
  abacateBillingUrl: string | null;
};

async function findAbacateBillingForCheckout(
  checkout: Pick<CheckoutReconcileTarget, "abacateBillingId" | "providerExternalId">,
): Promise<AbacateBilling | null> {
  const billings = await listAbacateBillings();

  if (checkout.abacateBillingId) {
    const byId = billings.find((billing) => billing.id === checkout.abacateBillingId);
    if (byId) {
      return byId;
    }
  }

  const byExternalId = billings.find((billing) =>
    billing.products.some((product) => product.externalId === checkout.providerExternalId),
  );

  return byExternalId ?? null;
}

export async function reconcileCheckoutFromAbacate(input: {
  ownerUserId: string;
  checkoutId: string;
}): Promise<boolean> {
  if (!isAbacatePayConfigured()) {
    return false;
  }

  const checkout = await prisma.billingCheckoutSession.findFirst({
    where: {
      id: input.checkoutId,
      ownerUserId: input.ownerUserId,
    },
    select: {
      id: true,
      ownerUserId: true,
      subscriptionId: true,
      targetPlanCode: true,
      amountCents: true,
      currency: true,
      providerExternalId: true,
      abacateBillingId: true,
      abacateBillingUrl: true,
    },
  });

  if (!checkout) {
    return false;
  }

  const billing = await findAbacateBillingForCheckout(checkout);
  if (!billing) {
    return false;
  }

  const outcome = billingStatusToOutcome(billing.status);
  const trustedBillingUrl = sanitizeTrustedAbacateUrl(billing.url);
  if (!trustedBillingUrl) {
    throw new Error("URL de billing retornada pelo provedor não é confiável.");
  }

  if (!outcome) {
    await prisma.billingCheckoutSession.update({
      where: {
        id: checkout.id,
      },
      data: {
        status: mapBillingStatus(billing.status),
        abacateBillingId: billing.id,
        abacateBillingUrl: trustedBillingUrl,
      },
    });

    return false;
  }

  const syntheticPayload: AbacateWebhookPayload = {
    id: `reconcile_${checkout.id}_${billing.id}`,
    event: "billing.reconciled",
    data: {
      billing: {
        id: billing.id,
        status: billing.status,
        url: trustedBillingUrl,
        amount: billing.amount,
        paidAmount: billing.paidAmount,
        currency: billing.currency,
        products: billing.products.map((product) => ({
          externalId: product.externalId,
          quantity: product.quantity,
          price: product.price,
        })),
      },
      payment: {
        amount: billing.paidAmount ?? billing.amount,
        currency: billing.currency,
      },
    },
  };

  await applyWebhookOutcome(checkout, syntheticPayload, outcome, "reconcile");
  return true;
}

function bucketForRollout(seed: string, subjectKey: string): number {
  const hash = createHash("sha256").update(`${seed}:${subjectKey}`).digest();
  const value = hash.readUInt32BE(0);
  return value % 100;
}

export async function isFeatureEnabledForOwner(input: {
  ownerUserId: string;
  featureKey: PlanFeatureKey;
  subjectKey?: string;
}): Promise<boolean> {
  const [entitlements, override, rollout] = await Promise.all([
    getOwnerEntitlements(input.ownerUserId),
    prisma.ownerFeatureOverride.findUnique({
      where: {
        ownerUserId_featureKey: {
          ownerUserId: input.ownerUserId,
          featureKey: input.featureKey,
        },
      },
    }),
    prisma.featureRollout.findUnique({
      where: {
        featureKey: input.featureKey,
      },
    }),
  ]);

  if (override) {
    return override.enabled;
  }

  const plan = getPlanDefinition(entitlements.effectivePlanCode);
  if (plan.features.includes(input.featureKey)) {
    return true;
  }

  if (!rollout || !rollout.enabled || rollout.rolloutPercentage <= 0) {
    return false;
  }

  if (rollout.rolloutPercentage >= 100) {
    return true;
  }

  const subjectKey = input.subjectKey ?? `${input.ownerUserId}:${input.featureKey}`;
  return bucketForRollout(rollout.seed, subjectKey) < rollout.rolloutPercentage;
}

export async function listOwnerFeatureStatuses(
  ownerUserId: string,
): Promise<OwnerFeatureStatus[]> {
  const entitlements = await getOwnerEntitlements(ownerUserId);
  const plan = getPlanDefinition(entitlements.effectivePlanCode);
  const overrides = await prisma.ownerFeatureOverride.findMany({
    where: {
      ownerUserId,
    },
  });

  const rollouts = await prisma.featureRollout.findMany({
    where: {
      featureKey: {
        in: Object.keys(FEATURE_LABELS),
      },
    },
  });

  const overrideByFeature = new Map(overrides.map((item) => [item.featureKey, item]));
  const rolloutByFeature = new Map(rollouts.map((item) => [item.featureKey, item]));

  return (Object.keys(FEATURE_LABELS) as PlanFeatureKey[]).map((featureKey) => {
    const override = overrideByFeature.get(featureKey);
    if (override) {
      return {
        key: featureKey,
        label: FEATURE_LABELS[featureKey],
        enabled: override.enabled,
        source: "override",
      };
    }

    if (plan.features.includes(featureKey)) {
      return {
        key: featureKey,
        label: FEATURE_LABELS[featureKey],
        enabled: true,
        source: "plan",
      };
    }

    const rollout = rolloutByFeature.get(featureKey);
    if (rollout && rollout.enabled && rollout.rolloutPercentage > 0) {
      const enabled =
        rollout.rolloutPercentage >= 100
          ? true
          : bucketForRollout(rollout.seed, `${ownerUserId}:${featureKey}`) <
            rollout.rolloutPercentage;

      return {
        key: featureKey,
        label: FEATURE_LABELS[featureKey],
        enabled,
        source: enabled ? "rollout" : "disabled",
      };
    }

    return {
      key: featureKey,
      label: FEATURE_LABELS[featureKey],
      enabled: false,
      source: "disabled",
    };
  });
}

export async function getBillingPageData(
  ownerUserId: string,
  options?: {
    checkoutId?: string | null;
  },
) {
  const checkoutId = options?.checkoutId?.trim();

  if (checkoutId) {
    try {
      await reconcileCheckoutFromAbacate({
        ownerUserId,
        checkoutId,
      });
    } catch (error) {
      console.error("Falha ao reconciliar checkout com AbacatePay.", error);
    }
  } else {
    const latestPendingCheckout = await prisma.billingCheckoutSession.findFirst({
      where: {
        ownerUserId,
        status: CheckoutStatus.PENDING,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
      },
    });

    if (latestPendingCheckout) {
      try {
        await reconcileCheckoutFromAbacate({
          ownerUserId,
          checkoutId: latestPendingCheckout.id,
        });
      } catch (error) {
        console.error("Falha ao reconciliar checkout pendente com AbacatePay.", error);
      }
    }
  }

  const [entitlements, invoices, features] = await Promise.all([
    getOwnerEntitlements(ownerUserId),
    listOwnerInvoices(ownerUserId),
    listOwnerFeatureStatuses(ownerUserId),
  ]);

  return {
    entitlements,
    invoices,
    features,
    plans: BILLING_PLAN_SEQUENCE.map((planCode) => getPlanDefinition(planCode)),
  };
}

function inferCheckoutOutcome(payload: AbacateWebhookPayload): CheckoutStatus | null {
  const eventName = payload.event;

  if (eventName === "billing.paid") {
    return CheckoutStatus.PAID;
  }

  if (eventName === "billing.failed") {
    return CheckoutStatus.FAILED;
  }

  if (eventName === "billing.expired" || eventName === "subscription.expired") {
    return CheckoutStatus.EXPIRED;
  }

  if (eventName === "billing.chargeback" || eventName === "billing.refunded") {
    return CheckoutStatus.CHARGEBACK;
  }

  const billingStatus = payload.data?.billing?.status ?? "";
  if (billingStatus === "PAID") {
    return CheckoutStatus.PAID;
  }
  if (billingStatus === "EXPIRED") {
    return CheckoutStatus.EXPIRED;
  }
  if (billingStatus === "CANCELLED") {
    return CheckoutStatus.FAILED;
  }
  if (billingStatus === "REFUNDED") {
    return CheckoutStatus.CHARGEBACK;
  }

  const transactionStatus = payload.data?.transaction?.status ?? "";
  if (transactionStatus === "COMPLETE") {
    return CheckoutStatus.PAID;
  }
  if (transactionStatus === "CANCELLED") {
    return CheckoutStatus.FAILED;
  }
  if (transactionStatus === "REFUNDED") {
    return CheckoutStatus.CHARGEBACK;
  }

  return null;
}

type AbacateWebhookPayload = {
  id: string;
  event: string;
  data?: {
    billing?: {
      id?: string;
      status?: string;
      url?: string;
      amount?: number | string;
      paidAmount?: number | string;
      currency?: string;
      products?: Array<{
        externalId?: string;
        quantity?: number | string;
        price?: number | string;
      }>;
    };
    transaction?: {
      id?: string;
      status?: string;
      receiptUrl?: string;
      externalId?: string;
      amount?: number | string;
      amountCents?: number | string;
      currency?: string;
    };
    payment?: {
      amount?: number | string;
      amountCents?: number | string;
      currency?: string;
    };
    pixQrCode?: {
      amount?: number | string;
      currency?: string;
    };
  };
};

function parseWebhookAmountCents(input: unknown): number | null {
  if (
    typeof input === "number" &&
    Number.isFinite(input) &&
    Number.isSafeInteger(input) &&
    input >= 0
  ) {
    return input;
  }

  if (typeof input === "string" && /^\d+$/.test(input.trim())) {
    const parsed = Number.parseInt(input.trim(), 10);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  return null;
}

function parseWebhookCurrency(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const normalized = input.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function sumWebhookProductsAmountCents(
  products:
    | Array<{
        quantity?: number | string;
        price?: number | string;
      }>
    | undefined,
): number | null {
  if (!Array.isArray(products) || products.length === 0) {
    return null;
  }

  let total = 0;
  for (const product of products) {
    const quantity = parseWebhookAmountCents(product.quantity);
    const price = parseWebhookAmountCents(product.price);
    if (quantity === null || price === null || quantity <= 0) {
      return null;
    }

    total += quantity * price;
  }

  return total;
}

function resolveWebhookPaidAmountCents(payload: AbacateWebhookPayload): number | null {
  const directCandidates: unknown[] = [
    payload.data?.payment?.amountCents,
    payload.data?.payment?.amount,
    payload.data?.transaction?.amountCents,
    payload.data?.transaction?.amount,
    payload.data?.billing?.paidAmount,
    payload.data?.billing?.amount,
    payload.data?.pixQrCode?.amount,
  ];

  for (const candidate of directCandidates) {
    const parsed = parseWebhookAmountCents(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  return sumWebhookProductsAmountCents(payload.data?.billing?.products);
}

function resolveWebhookPaidCurrency(payload: AbacateWebhookPayload): string | null {
  const currencyCandidates: unknown[] = [
    payload.data?.payment?.currency,
    payload.data?.transaction?.currency,
    payload.data?.billing?.currency,
    payload.data?.pixQrCode?.currency,
  ];

  for (const candidate of currencyCandidates) {
    const parsed = parseWebhookCurrency(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function sanitizeTrustedAbacateUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) {
    return null;
  }

  const normalized = rawUrl.trim();
  if (!normalized) {
    return null;
  }

  return isTrustedAbacateCheckoutUrl(normalized) ? normalized : null;
}

function assertPaidWebhookAmountAndCurrency(
  checkout: {
    amountCents: number;
    currency: string;
  },
  payload: AbacateWebhookPayload,
): void {
  const paidAmountCents = resolveWebhookPaidAmountCents(payload);
  if (paidAmountCents === null) {
    throw new Error("Webhook de pagamento sem valor monetário válido.");
  }

  if (paidAmountCents !== checkout.amountCents) {
    throw new Error("Valor pago divergente do checkout esperado.");
  }

  const expectedCurrency = checkout.currency.trim().toUpperCase();
  if (!expectedCurrency) {
    throw new Error("Moeda esperada do checkout não está definida.");
  }

  const paidCurrency = resolveWebhookPaidCurrency(payload);
  if (paidCurrency && paidCurrency !== expectedCurrency) {
    throw new Error("Moeda do pagamento divergente da moeda esperada.");
  }

  if (!paidCurrency && expectedCurrency !== "BRL") {
    throw new Error("Webhook sem moeda explícita para checkout fora de BRL.");
  }
}

function parseWebhookPayload(input: unknown): AbacateWebhookPayload {
  if (typeof input !== "object" || input === null) {
    throw new Error("Payload de webhook inválido.");
  }

  const payload = input as Record<string, unknown>;
  const id = typeof payload.id === "string" ? payload.id : "";
  const event = typeof payload.event === "string" ? payload.event : "";

  if (!id || !event) {
    throw new Error("Webhook sem id ou event.");
  }

  return payload as AbacateWebhookPayload;
}

async function markWebhookEvent(
  eventId: string,
  status: WebhookProcessingStatus,
  errorMessage: string | null,
): Promise<void> {
  await prisma.billingWebhookEvent.update({
    where: {
      id: eventId,
    },
    data: {
      status,
      errorMessage,
      processedAt: status === WebhookProcessingStatus.PROCESSED ? new Date() : null,
    },
  });
}

async function resolveCheckoutFromWebhook(payload: AbacateWebhookPayload) {
  const billingId = payload.data?.billing?.id;
  const externalIdFromTransaction = payload.data?.transaction?.externalId;
  const externalIdFromProducts = payload.data?.billing?.products?.find((item) => item.externalId)
    ?.externalId;

  if (billingId) {
    const byBillingId = await prisma.billingCheckoutSession.findFirst({
      where: {
        abacateBillingId: billingId,
      },
    });

    if (byBillingId) {
      return byBillingId;
    }
  }

  const externalId = externalIdFromTransaction || externalIdFromProducts;
  if (!externalId) {
    return null;
  }

  return prisma.billingCheckoutSession.findFirst({
    where: {
      providerExternalId: externalId,
    },
  });
}

async function applyWebhookOutcome(
  checkout: {
    id: string;
    ownerUserId: string;
    subscriptionId: string;
    targetPlanCode: BillingPlanCode;
    amountCents: number;
    currency: string;
    abacateBillingId: string | null;
    abacateBillingUrl: string | null;
  },
  payload: AbacateWebhookPayload,
  outcome: CheckoutStatus,
  source: "webhook" | "reconcile" = "webhook",
): Promise<void> {
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const checkoutSnapshot = await tx.billingCheckoutSession.findUnique({
      where: {
        id: checkout.id,
      },
      select: {
        id: true,
        status: true,
        ownerUserId: true,
        subscriptionId: true,
        targetPlanCode: true,
        amountCents: true,
        currency: true,
        abacateBillingId: true,
        abacateBillingUrl: true,
        metadata: true,
      },
    });

    if (!checkoutSnapshot) {
      throw new Error("Checkout não encontrado para processar webhook.");
    }

    const incomingBillingId = payload.data?.billing?.id ?? null;
    if (
      checkoutSnapshot.abacateBillingId &&
      incomingBillingId &&
      checkoutSnapshot.abacateBillingId !== incomingBillingId
    ) {
      return;
    }

    const currentStatus = checkoutSnapshot.status;
    const mayBeRecurringPaidEvent =
      source === "webhook" &&
      currentStatus === CheckoutStatus.PAID &&
      outcome === CheckoutStatus.PAID;

    if (outcome === CheckoutStatus.PAID) {
      assertPaidWebhookAmountAndCurrency(checkoutSnapshot, payload);
    }

    const transactionId =
      payload.data?.transaction?.id ??
      (outcome === CheckoutStatus.PAID && source === "webhook" ? `evt_${payload.id}` : null);
    const receiptUrl = sanitizeTrustedAbacateUrl(payload.data?.transaction?.receiptUrl ?? null);
    const billingId = payload.data?.billing?.id ?? checkoutSnapshot.abacateBillingId ?? null;
    const billingUrl =
      sanitizeTrustedAbacateUrl(payload.data?.billing?.url ?? null) ??
      sanitizeTrustedAbacateUrl(checkoutSnapshot.abacateBillingUrl ?? null);
    const baseProviderBillingId = billingId ?? `fallback_${checkoutSnapshot.id}`;

    let isRecurringPaidEvent = false;

    if (mayBeRecurringPaidEvent) {
      const basePaidInvoice = await tx.billingInvoice.findFirst({
        where: {
          checkoutSessionId: checkoutSnapshot.id,
          providerBillingId: baseProviderBillingId,
          status: CheckoutStatus.PAID,
        },
        orderBy: {
          createdAt: "asc",
        },
        select: {
          id: true,
          providerTransactionId: true,
        },
      });

      if (
        basePaidInvoice &&
        (basePaidInvoice.providerTransactionId === null ||
          basePaidInvoice.providerTransactionId === transactionId)
      ) {
        await tx.billingInvoice.update({
          where: {
            id: basePaidInvoice.id,
          },
          data: {
            providerTransactionId: transactionId,
            receiptUrl,
            billingUrl,
            paidAt: now,
          },
        });
        return;
      }

      isRecurringPaidEvent = true;
    }

    if (currentStatus === outcome && !isRecurringPaidEvent) {
      return;
    }

    const allowPaidToChargeback =
      currentStatus === CheckoutStatus.PAID && outcome === CheckoutStatus.CHARGEBACK;
    if (
      isCheckoutFinalStatus(currentStatus) &&
      !allowPaidToChargeback &&
      !isRecurringPaidEvent
    ) {
      return;
    }

    const providerBillingLookupId = isRecurringPaidEvent
      ? `${baseProviderBillingId}:${payload.id}`
      : baseProviderBillingId;

    await tx.billingCheckoutSession.update({
      where: {
        id: checkoutSnapshot.id,
      },
      data: {
        status: outcome,
        paidAt: outcome === CheckoutStatus.PAID ? now : null,
      },
    });

    if (isRecurringPaidEvent) {
      await tx.billingInvoice.upsert({
        where: {
          providerBillingId: providerBillingLookupId,
        },
        create: {
          ownerUserId: checkoutSnapshot.ownerUserId,
          subscriptionId: checkoutSnapshot.subscriptionId,
          checkoutSessionId: checkoutSnapshot.id,
          providerBillingId: providerBillingLookupId,
          providerTransactionId: transactionId,
          status: outcome,
          amountCents: checkoutSnapshot.amountCents,
          currency: checkoutSnapshot.currency,
          receiptUrl,
          billingUrl,
          paidAt: now,
        },
        update: {
          checkoutSessionId: checkoutSnapshot.id,
          providerTransactionId: transactionId,
          status: outcome,
          receiptUrl,
          billingUrl,
          paidAt: now,
        },
      });
    } else {
      const existingInvoice = await tx.billingInvoice.findFirst({
        where: {
          checkoutSessionId: checkoutSnapshot.id,
        },
        select: {
          id: true,
        },
      });

      if (existingInvoice) {
        await tx.billingInvoice.update({
          where: {
            id: existingInvoice.id,
          },
          data: {
            providerBillingId: providerBillingLookupId,
            providerTransactionId: transactionId,
            status: outcome,
            receiptUrl,
            billingUrl,
            paidAt: outcome === CheckoutStatus.PAID ? now : null,
          },
        });
      } else {
        await tx.billingInvoice.upsert({
          where: {
            providerBillingId: providerBillingLookupId,
          },
          create: {
            ownerUserId: checkoutSnapshot.ownerUserId,
            subscriptionId: checkoutSnapshot.subscriptionId,
            checkoutSessionId: checkoutSnapshot.id,
            providerBillingId: providerBillingLookupId,
            providerTransactionId: transactionId,
            status: outcome,
            amountCents: checkoutSnapshot.amountCents,
            currency: checkoutSnapshot.currency,
            receiptUrl,
            billingUrl,
            paidAt: outcome === CheckoutStatus.PAID ? now : null,
          },
          update: {
            checkoutSessionId: checkoutSnapshot.id,
            providerTransactionId: transactionId,
            status: outcome,
            receiptUrl,
            billingUrl,
            paidAt: outcome === CheckoutStatus.PAID ? now : null,
          },
        });
      }
    }

    const subscriptionSnapshot = await tx.ownerSubscription.findUnique({
      where: {
        id: checkoutSnapshot.subscriptionId,
      },
      select: {
        status: true,
        planCode: true,
        pendingPlanCode: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
      },
    });

    if (!subscriptionSnapshot) {
      throw new Error("Assinatura vinculada ao checkout não encontrada.");
    }

    if (outcome === CheckoutStatus.PAID) {
      const nextPeriodStart =
        isRecurringPaidEvent &&
        subscriptionSnapshot.currentPeriodEnd &&
        subscriptionSnapshot.currentPeriodEnd > now
          ? subscriptionSnapshot.currentPeriodEnd
          : now;
      const billingCycle = resolveCheckoutBillingCycle(checkoutSnapshot.metadata);
      const nextPeriodEnd = addDays(nextPeriodStart, getBillingPeriodDays(billingCycle));

      await tx.ownerSubscription.update({
        where: {
          id: checkoutSnapshot.subscriptionId,
        },
        data: {
          status: SubscriptionStatus.ACTIVE,
          planCode: checkoutSnapshot.targetPlanCode,
          pendingPlanCode: null,
          trialPlanCode: null,
          currentPeriodStart: nextPeriodStart,
          currentPeriodEnd: nextPeriodEnd,
          cancelAtPeriodEnd: false,
          canceledAt: null,
        },
      });
      return;
    }

    if (outcome === CheckoutStatus.CHARGEBACK) {
      await tx.ownerSubscription.update({
        where: {
          id: checkoutSnapshot.subscriptionId,
        },
        data: {
          status: SubscriptionStatus.PAST_DUE,
          planCode: BillingPlanCode.FREE,
          pendingPlanCode: null,
          currentPeriodStart: now,
          currentPeriodEnd: now,
          cancelAtPeriodEnd: false,
          canceledAt: now,
        },
      });
      return;
    }

    if (outcome === CheckoutStatus.EXPIRED) {
      const hasPendingPlanChange =
        subscriptionSnapshot.pendingPlanCode === checkoutSnapshot.targetPlanCode;
      const shouldDowngradeNow =
        subscriptionSnapshot.status === SubscriptionStatus.PAST_DUE ||
        (subscriptionSnapshot.status === SubscriptionStatus.ACTIVE &&
          Boolean(
            subscriptionSnapshot.currentPeriodEnd &&
              subscriptionSnapshot.currentPeriodEnd <= now,
          ));

      if (!shouldDowngradeNow || hasPendingPlanChange) {
        await tx.ownerSubscription.update({
          where: {
            id: checkoutSnapshot.subscriptionId,
          },
          data: {
            pendingPlanCode: null,
          },
        });
        return;
      }

      await tx.ownerSubscription.update({
        where: {
          id: checkoutSnapshot.subscriptionId,
        },
        data: {
          status: SubscriptionStatus.EXPIRED,
          planCode: BillingPlanCode.FREE,
          pendingPlanCode: null,
          currentPeriodEnd: now,
        },
      });
      return;
    }

    if (outcome === CheckoutStatus.FAILED) {
      const hasPendingPlanChange =
        subscriptionSnapshot.pendingPlanCode === checkoutSnapshot.targetPlanCode;
      const shouldStartDunning =
        !hasPendingPlanChange &&
        isPaidPlan(subscriptionSnapshot.planCode) &&
        (subscriptionSnapshot.status === SubscriptionStatus.PAST_DUE ||
          (subscriptionSnapshot.status === SubscriptionStatus.ACTIVE &&
            Boolean(
              subscriptionSnapshot.currentPeriodEnd &&
                subscriptionSnapshot.currentPeriodEnd <= now,
            )));

      if (shouldStartDunning) {
        const gracePeriod = nowInPastDueGracePeriod();
        const hasActiveGraceWindow =
          subscriptionSnapshot.status === SubscriptionStatus.PAST_DUE &&
          Boolean(
            subscriptionSnapshot.currentPeriodEnd &&
              subscriptionSnapshot.currentPeriodEnd > now,
          );

        await tx.ownerSubscription.update({
          where: {
            id: checkoutSnapshot.subscriptionId,
          },
          data: {
            status: SubscriptionStatus.PAST_DUE,
            pendingPlanCode: null,
            currentPeriodStart: hasActiveGraceWindow
              ? subscriptionSnapshot.currentPeriodStart
              : gracePeriod.start,
            currentPeriodEnd: hasActiveGraceWindow
              ? subscriptionSnapshot.currentPeriodEnd
              : gracePeriod.end,
            cancelAtPeriodEnd: false,
            canceledAt: null,
          },
        });
        return;
      }
    }

    await tx.ownerSubscription.update({
      where: {
        id: checkoutSnapshot.subscriptionId,
      },
      data: {
        pendingPlanCode: null,
      },
    });
  });
}

export async function processAbacateWebhook(payloadInput: unknown): Promise<{
  duplicate: boolean;
  processed: boolean;
}> {
  const payload = parseWebhookPayload(payloadInput);

  try {
    await prisma.billingWebhookEvent.create({
      data: {
        id: payload.id,
        provider: "abacatepay",
        eventType: payload.event,
        status: WebhookProcessingStatus.RECEIVED,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        duplicate: true,
        processed: false,
      };
    }

    throw error;
  }

  const outcome = inferCheckoutOutcome(payload);

  if (!outcome) {
    await markWebhookEvent(payload.id, WebhookProcessingStatus.IGNORED, null);
    return {
      duplicate: false,
      processed: false,
    };
  }

  try {
    const checkout = await resolveCheckoutFromWebhook(payload);

    if (!checkout) {
      await markWebhookEvent(
        payload.id,
        WebhookProcessingStatus.IGNORED,
        "Checkout não encontrado para o evento recebido.",
      );

      return {
        duplicate: false,
        processed: false,
      };
    }

    await applyWebhookOutcome(checkout, payload, outcome, "webhook");
    await markWebhookEvent(payload.id, WebhookProcessingStatus.PROCESSED, null);

    return {
      duplicate: false,
      processed: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao processar webhook.";
    await markWebhookEvent(payload.id, WebhookProcessingStatus.FAILED, message);
    throw error;
  }
}
