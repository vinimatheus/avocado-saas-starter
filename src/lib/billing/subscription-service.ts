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
export const EXPIRED_TRIAL_BLOCK_MESSAGE = `O trial gratuito de ${DEFAULT_TRIAL_DAYS} dias expirou. Esta organizacao esta bloqueada ate a contratacao de um plano pago.`;
const DEFAULT_CHECKOUT_PENDING_TIMEOUT_MINUTES = 5;
const MAX_CHECKOUT_PENDING_TIMEOUT_MINUTES = 5;
const PAST_DUE_REMINDER_DAYS = [7, 14, 21] as const;
const DUNNING_EMAIL_DAYS = [1, 3, 7, 14] as const;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_NEW_ORGANIZATION_TRIAL_PLAN_CODE = BillingPlanCode.STARTER_50;

type OwnerUsageSnapshot = {
  organizations: number;
  users: number;
  pendingInvitations: number;
  projects: number;
  monthlyUsage: number;
};

type DunningReminderCheckpoint = (typeof PAST_DUE_REMINDER_DAYS)[number] | null;
type DunningEmailDay = (typeof DUNNING_EMAIL_DAYS)[number];

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
  organizationId: string;
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

function resolveOrganizationBlockMessageFromSubscription(
  subscription: Pick<
    OwnerSubscription,
    "status" | "trialUsedAt" | "trialEndsAt" | "planCode" | "currentPeriodEnd"
  >,
): string | null {
  if (!subscription.trialUsedAt || !subscription.trialEndsAt) {
    return null;
  }

  const now = new Date();
  if (subscription.trialEndsAt > now) {
    return null;
  }

  const hasPaidAccess =
    isPaidPlan(subscription.planCode) &&
    ((subscription.status === SubscriptionStatus.ACTIVE &&
      (!subscription.currentPeriodEnd || subscription.currentPeriodEnd > now)) ||
      (subscription.status === SubscriptionStatus.PAST_DUE &&
        subscription.currentPeriodEnd &&
        subscription.currentPeriodEnd > now));

  return hasPaidAccess ? null : EXPIRED_TRIAL_BLOCK_MESSAGE;
}

export function isOrganizationBlockedAfterExpiredTrial(
  subscription: Pick<
    OwnerSubscription,
    "status" | "trialUsedAt" | "trialEndsAt" | "planCode" | "currentPeriodEnd"
  >,
): boolean {
  return resolveOrganizationBlockMessageFromSubscription(subscription) !== null;
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function parsePositiveIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value?.trim() ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function getCheckoutPendingTimeoutMs(): number {
  const configuredMinutes = parsePositiveIntEnv(
    process.env.CHECKOUT_PENDING_TIMEOUT_MINUTES,
    DEFAULT_CHECKOUT_PENDING_TIMEOUT_MINUTES,
  );
  return Math.min(configuredMinutes, MAX_CHECKOUT_PENDING_TIMEOUT_MINUTES) * 60 * 1000;
}

function isStalePendingCheckout(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() >= getCheckoutPendingTimeoutMs();
}

async function failStaleCheckout(input: {
  organizationId: string;
  checkoutId: string;
  subscriptionId: string;
  targetPlanCode: BillingPlanCode;
}): Promise<void> {
  await prisma.$transaction([
    prisma.billingCheckoutSession.updateMany({
      where: {
        id: input.checkoutId,
        organizationId: input.organizationId,
        status: CheckoutStatus.PENDING,
      },
      data: {
        status: CheckoutStatus.FAILED,
      },
    }),
    prisma.ownerSubscription.updateMany({
      where: {
        id: input.subscriptionId,
        pendingPlanCode: input.targetPlanCode,
      },
      data: {
        pendingPlanCode: null,
      },
    }),
  ]);
}

function isTimeoutError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "TimeoutError"
  );
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

function resolveApplicableDunningEmailDay(
  graceStartedAt: Date,
  now: Date = new Date(),
): DunningEmailDay | null {
  const elapsedDays = Math.max(
    0,
    Math.floor((now.getTime() - graceStartedAt.getTime()) / DAY_IN_MS),
  );
  const currentGraceDay = elapsedDays + 1;

  for (let index = DUNNING_EMAIL_DAYS.length - 1; index >= 0; index -= 1) {
    const day = DUNNING_EMAIL_DAYS[index];
    if (currentGraceDay >= day) {
      return day;
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

  const exceededUsers =
    effectivePlan.limits.maxUsers === null
      ? 0
      : Math.max(0, usedSeats - effectivePlan.limits.maxUsers);

  return {
    isRestricted: exceededUsers > 0,
    exceededOrganizations: 0,
    exceededUsers,
  };
}

async function getOwnerUsageSnapshot(
  organizationId: string,
  metricKey: string = DEFAULT_USAGE_METRIC_KEY,
): Promise<OwnerUsageSnapshot> {
  const [users, pendingInvitations, projects, monthlyUsageResult] = await Promise.all([
    prisma.member.count({
      where: {
        organizationId,
      },
    }),
    prisma.invitation.count({
      where: {
        organizationId,
        status: "pending",
      },
    }),
    prisma.product.count({
      where: {
        organizationId,
      },
    }),
    prisma.ownerMonthlyUsage.aggregate({
      where: {
        organizationId,
        metricKey,
        periodStart: startOfUtcMonth(),
      },
      _sum: {
        value: true,
      },
    }),
  ]);

  return {
    organizations: 1,
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
        organizationId: subscription.organizationId,
      },
      data: {
        status: SubscriptionStatus.EXPIRED,
        planCode: BillingPlanCode.FREE,
        pendingPlanCode: null,
        trialPlanCode: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        canceledAt: now,
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
          organizationId: subscription.organizationId,
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
        organizationId: subscription.organizationId,
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
        organizationId: subscription.organizationId,
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
  organizationId: string,
  options?: {
    ownerUserIdHint?: string | null;
  },
): Promise<OwnerSubscription> {
  const resolvedOwnerUserId = await resolveOrganizationPrimaryOwnerUserId(organizationId);
  const hintedOwnerUserId = options?.ownerUserIdHint?.trim() ?? null;

  // Note: `ensureOwnerSubscription` is used by org lifecycle hooks. During organization
  // creation Better Auth calls `beforeAddMember` before the first member row exists,
  // so resolving an owner via memberships can temporarily return null.
  let ownerUserId = resolvedOwnerUserId ?? hintedOwnerUserId;

  if (!ownerUserId) {
    const existing = await prisma.ownerSubscription.findUnique({
      where: {
        organizationId,
      },
      select: {
        ownerUserId: true,
      },
    });

    ownerUserId = existing?.ownerUserId ?? null;
  }

  if (!ownerUserId) {
    throw new Error("Organizacao sem proprietario para configurar assinatura.");
  }

  const basicProfile = await getOwnerBasicProfile(ownerUserId);
  const trialWindow = nowInPeriod(DEFAULT_TRIAL_DAYS);

  const upsertPayload = {
    where: {
      organizationId,
    },
    create: {
      organizationId,
      ownerUserId,
      status: SubscriptionStatus.TRIALING,
      planCode: BillingPlanCode.FREE,
      trialPlanCode: DEFAULT_NEW_ORGANIZATION_TRIAL_PLAN_CODE,
      trialStartedAt: trialWindow.start,
      trialEndsAt: trialWindow.end,
      trialUsedAt: trialWindow.start,
      billingName: basicProfile.name,
    },
    update: {
      ownerUserId,
      ...(basicProfile.name
        ? {
          billingName: basicProfile.name,
        }
        : {}),
    },
  } satisfies Prisma.OwnerSubscriptionUpsertArgs;

  try {
    return await prisma.ownerSubscription.upsert(upsertPayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const normalized = message.toLowerCase();
    const shouldFallback =
      normalized.includes("42p10") ||
      (normalized.includes("on conflict") &&
        normalized.includes("unique or exclusion constraint"));

    if (!shouldFallback) {
      throw error;
    }

    // Database drift fallback: some production databases might be missing the UNIQUE constraint for
    // `owner_subscription.organization_id`, which makes Postgres reject `ON CONFLICT`. We can still
    // ensure a subscription by reading + updating/creating.
    console.warn(
      "OwnerSubscription upsert fallback: missing UNIQUE constraint on organization_id (42P10).",
    );
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.ownerSubscription.findFirst({
      where: {
        organizationId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (existing) {
      return tx.ownerSubscription.update({
        where: {
          id: existing.id,
        },
        data: upsertPayload.update,
      });
    }

    return tx.ownerSubscription.create({
      data: upsertPayload.create,
    });
  });
}

function resolveEffectivePlanCode(
  subscription: Pick<
    OwnerSubscription,
    "status" | "trialPlanCode" | "trialEndsAt" | "currentPeriodEnd" | "planCode"
  >,
): BillingPlanCode {
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
  organizationId: string,
  metricKey: string = DEFAULT_USAGE_METRIC_KEY,
): Promise<OwnerEntitlements> {
  const subscription = await ensureOwnerSubscription(organizationId);
  const syncedSubscription = await setSubscriptionAsExpiredIfNeeded(subscription);

  const [effectivePlanCode, usage] = await Promise.all([
    Promise.resolve(resolveEffectivePlanCode(syncedSubscription)),
    getOwnerUsageSnapshot(organizationId, metricKey),
  ]);

  const dunning = buildOwnerDunningState(syncedSubscription);
  const restriction = buildOwnerRestrictionState(effectivePlanCode, usage);

  return {
    organizationId,
    ownerUserId: syncedSubscription.ownerUserId,
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

function assertNotBlockedByExpiredTrial(entitlements: OwnerEntitlements): void {
  const blockMessage = resolveOrganizationBlockMessageFromSubscription(entitlements.subscription);
  if (!blockMessage) {
    return;
  }

  throw new Error(blockMessage);
}

export async function getOrganizationBlockMessage(
  organizationId: string,
): Promise<string | null> {
  const entitlements = await getOwnerEntitlements(organizationId);
  return resolveOrganizationBlockMessageFromSubscription(entitlements.subscription);
}

export async function assertOrganizationNotBlockedAfterExpiredTrial(
  organizationId: string,
): Promise<void> {
  const blockMessage = await getOrganizationBlockMessage(organizationId);
  if (!blockMessage) {
    return;
  }

  throw new Error(blockMessage);
}

export async function assertOwnerCanCreateOrganization(ownerUserId: string): Promise<void> {
  const normalizedOwnerUserId = ownerUserId.trim();
  if (!normalizedOwnerUserId) {
    throw new Error("Usuario invalido para criar organizacao.");
  }

  const [ownedOrganizationsCount, subscriptions] = await Promise.all([
    prisma.member.count({
      where: {
        userId: normalizedOwnerUserId,
        role: {
          contains: "owner",
        },
      },
    }),
    prisma.ownerSubscription.findMany({
      where: {
        ownerUserId: normalizedOwnerUserId,
      },
      select: {
        status: true,
        planCode: true,
        trialPlanCode: true,
        trialEndsAt: true,
        currentPeriodEnd: true,
      },
    }),
  ]);

  const candidatePlanCodes =
    subscriptions.length > 0
      ? subscriptions.map((subscription) => resolveEffectivePlanCode(subscription))
      : [BillingPlanCode.FREE];

  let maxAllowedOrganizations: number | null = 0;
  for (const planCode of candidatePlanCodes) {
    const currentLimit = getPlanDefinition(planCode).limits.maxOrganizations;
    if (currentLimit === null) {
      maxAllowedOrganizations = null;
      break;
    }

    maxAllowedOrganizations = Math.max(maxAllowedOrganizations, currentLimit);
  }

  if (maxAllowedOrganizations === null) {
    return;
  }

  if (ownedOrganizationsCount + 1 > maxAllowedOrganizations) {
    throw new Error(
      buildLimitErrorMessage("organizacoes", ownedOrganizationsCount, maxAllowedOrganizations),
    );
  }
}

export async function assertOrganizationCanCreateInvitation(
  organizationId: string,
  email: string,
): Promise<void> {
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

  const entitlements = await getOwnerEntitlements(organizationId);
  assertNotBlockedByExpiredTrial(entitlements);
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
  const entitlements = await getOwnerEntitlements(organizationId);
  assertNotBlockedByExpiredTrial(entitlements);
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
  const entitlements = await getOwnerEntitlements(organizationId);
  assertNotBlockedByExpiredTrial(entitlements);
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
  const entitlements = await getOwnerEntitlements(organizationId);
  assertNotBlockedByExpiredTrial(entitlements);
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
  const entitlements = await getOwnerEntitlements(organizationId, metricKey);
  assertNotBlockedByExpiredTrial(entitlements);
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
  const subscription = await ensureOwnerSubscription(input.organizationId);
  const ownerUserId = subscription.ownerUserId;

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
  organizationId: string,
  input: {
    billingName: string;
    billingCellphone: string;
    billingTaxId: string;
  },
): Promise<OwnerSubscription> {
  await ensureOwnerSubscription(organizationId);

  return prisma.ownerSubscription.update({
    where: {
      organizationId,
    },
    data: {
      billingName: input.billingName.trim(),
      billingCellphone: input.billingCellphone.trim(),
      billingTaxId: input.billingTaxId.trim(),
    },
  });
}

export async function startOwnerTrial(
  organizationId: string,
  trialPlanCode: BillingPlanCode,
): Promise<OwnerSubscription> {
  if (!isPaidPlan(trialPlanCode)) {
    throw new Error("Trial disponivel apenas para planos pagos.");
  }

  const subscription = await ensureOwnerSubscription(organizationId);
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
      organizationId,
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
  organizationId: string,
  immediate: boolean,
): Promise<OwnerSubscription> {
  const subscription = await ensureOwnerSubscription(organizationId);

  if (immediate || subscription.status === SubscriptionStatus.TRIALING) {
    return prisma.ownerSubscription.update({
      where: {
        organizationId,
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
      organizationId,
    },
    data: {
      cancelAtPeriodEnd: true,
      canceledAt: new Date(),
    },
  });
}

export async function reactivateOwnerSubscription(organizationId: string): Promise<OwnerSubscription> {
  const subscription = await ensureOwnerSubscription(organizationId);

  if (
    subscription.status === SubscriptionStatus.ACTIVE &&
    subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd > new Date()
  ) {
    return prisma.ownerSubscription.update({
      where: {
        organizationId,
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
        organizationId,
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

  // Reuse provider customer only for the same owner to avoid cross-tenant coupling.
  const sharedCustomerId = await prisma.ownerSubscription.findFirst({
    where: {
      ownerUserId: subscription.ownerUserId,
      organizationId: {
        not: subscription.organizationId,
      },
      billingTaxId: subscription.billingTaxId,
      abacateCustomerId: {
        not: null,
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      abacateCustomerId: true,
    },
  });

  if (sharedCustomerId?.abacateCustomerId) {
    return sharedCustomerId.abacateCustomerId;
  }

  const customer = await createAbacateCustomer({
    name: subscription.billingName,
    cellphone: subscription.billingCellphone,
    email: ownerProfile.email,
    taxId: subscription.billingTaxId,
  });

  try {
    await prisma.ownerSubscription.update({
      where: {
        organizationId: subscription.organizationId,
      },
      data: {
        abacateCustomerId: customer.id,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return customer.id;
    }

    throw error;
  }

  return customer.id;
}

export async function createPlanCheckoutSession(input: {
  organizationId: string;
  targetPlanCode: BillingPlanCode;
  billingCycle?: PlanBillingCycle;
  allowSamePlan?: boolean;
}): Promise<{ checkoutUrl: string; checkoutId: string }> {
  if (!isPaidPlan(input.targetPlanCode)) {
    throw new Error("Selecione um plano pago para iniciar checkout.");
  }

  if (!isAbacatePayConfigured()) {
    throw new Error("ABACATEPAY_API_KEY não configurada para gerar checkout.");
  }

  const subscription = await ensureOwnerSubscription(input.organizationId);
  const currentEntitlements = await getOwnerEntitlements(input.organizationId);

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
      ownerUserId: subscription.ownerUserId,
      subscriptionId: subscription.id,
      organizationId: input.organizationId,
      targetPlanCode: input.targetPlanCode,
      amountCents,
      metadata: {
        billingCycle,
        billingPeriodDays,
        organizationId: input.organizationId,
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
        ownerUserId: subscription.ownerUserId,
        organizationId: input.organizationId,
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
          organizationId: input.organizationId,
        },
        data: {
          pendingPlanCode: input.targetPlanCode,
        },
      }),
      prisma.billingInvoice.create({
        data: {
          ownerUserId: subscription.ownerUserId,
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

export async function applyFreeDowngrade(organizationId: string): Promise<OwnerSubscription> {
  await ensureOwnerSubscription(organizationId);

  return prisma.ownerSubscription.update({
    where: {
      organizationId,
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

export async function listOwnerInvoices(organizationId: string) {
  const subscription = await ensureOwnerSubscription(organizationId);

  return prisma.billingInvoice.findMany({
    where: {
      subscriptionId: subscription.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
  });
}

async function syncInvoiceFromBilling(
  subscription: Pick<OwnerSubscription, "id" | "ownerUserId" | "organizationId">,
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
      organizationId: subscription.organizationId,
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

  const incomingStatus = mapBillingStatus(billing.status);
  const existingInvoice = await prisma.billingInvoice.findUnique({
    where: {
      providerBillingId: billing.id,
    },
    select: {
      id: true,
      status: true,
    },
  });

  const shouldPreserveExistingFinalStatus =
    existingInvoice &&
    isCheckoutFinalStatus(existingInvoice.status) &&
    !(existingInvoice.status === CheckoutStatus.PAID && incomingStatus === CheckoutStatus.CHARGEBACK);
  const nextStatus = shouldPreserveExistingFinalStatus ? existingInvoice.status : incomingStatus;

  if (!existingInvoice) {
    await prisma.billingInvoice.create({
      data: {
        ownerUserId: subscription.ownerUserId,
        subscriptionId: subscription.id,
        checkoutSessionId: checkout.id,
        providerBillingId: billing.id,
        status: nextStatus,
        amountCents: checkout.amountCents,
        billingUrl: billing.url,
      },
    });
    return;
  }

  await prisma.billingInvoice.update({
    where: {
      id: existingInvoice.id,
    },
    data: {
      checkoutSessionId: checkout.id,
      status: nextStatus,
      billingUrl: billing.url,
    },
  });
}

export async function syncOwnerInvoicesFromAbacate(organizationId: string): Promise<void> {
  if (!isAbacatePayConfigured()) {
    return;
  }

  const subscription = await ensureOwnerSubscription(organizationId);
  const checkouts = await prisma.billingCheckoutSession.findMany({
    where: {
      organizationId,
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
    await syncInvoiceFromBilling(
      {
        id: subscription.id,
        ownerUserId: subscription.ownerUserId,
        organizationId,
      },
      checkoutLookup,
      billing,
    );
  }
}

type CheckoutReconcileTarget = {
  id: string;
  status: CheckoutStatus;
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
  organizationId: string;
  checkoutId: string;
}): Promise<boolean> {
  if (!isAbacatePayConfigured()) {
    return false;
  }

  const checkout = await prisma.billingCheckoutSession.findFirst({
    where: {
      id: input.checkoutId,
      organizationId: input.organizationId,
    },
    select: {
      id: true,
      status: true,
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
    // Para assinatura recorrente, o billing pode seguir como ACTIVE mesmo apos um pagamento.
    // Nunca rebaixamos checkout finalizado para PENDING durante reconciliacao.
    if (isCheckoutFinalStatus(checkout.status)) {
      return false;
    }

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
  organizationId: string;
  featureKey: PlanFeatureKey;
  subjectKey?: string;
}): Promise<boolean> {
  const entitlements = await getOwnerEntitlements(input.organizationId);
  const ownerUserId = entitlements.ownerUserId;

  const [override, rollout] = await Promise.all([
    prisma.ownerFeatureOverride.findUnique({
      where: {
        ownerUserId_featureKey: {
          ownerUserId,
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

  const subjectKey = input.subjectKey ?? `${input.organizationId}:${input.featureKey}`;
  return bucketForRollout(rollout.seed, subjectKey) < rollout.rolloutPercentage;
}

export async function listOwnerFeatureStatuses(
  organizationId: string,
): Promise<OwnerFeatureStatus[]> {
  const entitlements = await getOwnerEntitlements(organizationId);
  const ownerUserId = entitlements.ownerUserId;
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
          : bucketForRollout(rollout.seed, `${organizationId}:${featureKey}`) <
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
  organizationId: string,
  options?: {
    checkoutId?: string | null;
  },
) {
  const checkoutId = options?.checkoutId?.trim();
  let latestPendingCheckout:
    | {
        id: string;
        status: CheckoutStatus;
        subscriptionId: string;
        targetPlanCode: BillingPlanCode;
        createdAt: Date;
      }
    | null = null;

  if (checkoutId) {
    try {
      await reconcileCheckoutFromAbacate({
        organizationId,
        checkoutId,
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        console.warn(
          "Reconciliação de checkout com AbacatePay excedeu o tempo limite; nova tentativa ocorrerá na próxima atualização.",
        );
      } else {
        console.error("Falha ao reconciliar checkout com AbacatePay.", error);
      }
    }
  } else {
    latestPendingCheckout = await prisma.billingCheckoutSession.findFirst({
      where: {
        organizationId,
        status: CheckoutStatus.PENDING,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        status: true,
        subscriptionId: true,
        targetPlanCode: true,
        createdAt: true,
      },
    });

    if (
      latestPendingCheckout &&
      latestPendingCheckout.status === CheckoutStatus.PENDING &&
      isStalePendingCheckout(latestPendingCheckout.createdAt)
    ) {
      await failStaleCheckout({
        organizationId,
        checkoutId: latestPendingCheckout.id,
        subscriptionId: latestPendingCheckout.subscriptionId,
        targetPlanCode: latestPendingCheckout.targetPlanCode,
      });
      latestPendingCheckout = null;
    }

    if (latestPendingCheckout) {
      // Keep this reconciliation non-blocking so the billing page does not wait on provider I/O.
      void reconcileCheckoutFromAbacate({
        organizationId,
        checkoutId: latestPendingCheckout.id,
      }).catch((error) => {
        if (isTimeoutError(error)) {
          console.warn(
            "Reconciliação de checkout pendente com AbacatePay excedeu o tempo limite; será tentada novamente.",
          );
        } else {
          console.error("Falha ao reconciliar checkout pendente com AbacatePay.", error);
        }
      });
    }
  }

  const selectedCheckout = checkoutId
    ? await prisma.billingCheckoutSession.findFirst({
        where: {
          id: checkoutId,
          organizationId,
        },
        select: {
          id: true,
          status: true,
          subscriptionId: true,
          targetPlanCode: true,
          createdAt: true,
        },
      })
    : latestPendingCheckout;

  if (selectedCheckout && selectedCheckout.status === CheckoutStatus.PENDING) {
    const paidInvoice = await prisma.billingInvoice.findFirst({
      where: {
        checkoutSessionId: selectedCheckout.id,
        status: CheckoutStatus.PAID,
      },
      select: {
        paidAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (paidInvoice) {
      const paidAt = paidInvoice.paidAt ?? selectedCheckout.createdAt;
      await prisma.billingCheckoutSession.update({
        where: {
          id: selectedCheckout.id,
        },
        data: {
          status: CheckoutStatus.PAID,
          paidAt,
        },
      });
      selectedCheckout.status = CheckoutStatus.PAID;
    }
  }

  if (
    selectedCheckout &&
    selectedCheckout.status === CheckoutStatus.PENDING &&
    isStalePendingCheckout(selectedCheckout.createdAt)
  ) {
    await failStaleCheckout({
      organizationId,
      checkoutId: selectedCheckout.id,
      subscriptionId: selectedCheckout.subscriptionId,
      targetPlanCode: selectedCheckout.targetPlanCode,
    });
    selectedCheckout.status = CheckoutStatus.FAILED;
  }

  const entitlements = await getOwnerEntitlements(organizationId);
  const hasPendingPlanChangeForSelectedCheckout = Boolean(
    selectedCheckout &&
      selectedCheckout.status === CheckoutStatus.PENDING &&
      entitlements.subscription.pendingPlanCode === selectedCheckout.targetPlanCode,
  );

  return {
    entitlements,
    plans: BILLING_PLAN_SEQUENCE.map((planCode) => getPlanDefinition(planCode)),
    checkoutState: selectedCheckout
      ? {
          id: selectedCheckout.id,
          status: selectedCheckout.status,
          targetPlanCode: selectedCheckout.targetPlanCode,
          createdAt: selectedCheckout.createdAt,
          isProcessing: hasPendingPlanChangeForSelectedCheckout,
        }
      : null,
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

type PaymentApprovedNotificationCandidate = {
  type: "payment-approved";
  dedupeKey: string;
  ownerUserId: string;
  organizationId: string;
  planCode: BillingPlanCode;
  amountCents: number;
  currency: string;
  paidAt: Date;
  receiptUrl: string | null;
  billingUrl: string | null;
};

type PaymentFailedDunningNotificationCandidate = {
  type: "payment-failed-dunning";
  dedupeKey: string;
  ownerUserId: string;
  organizationId: string;
  planCode: BillingPlanCode;
  dunningDay: DunningEmailDay;
  graceEndsAt: Date | null;
  billingUrl: string | null;
};

type BillingEmailNotificationCandidate =
  | PaymentApprovedNotificationCandidate
  | PaymentFailedDunningNotificationCandidate;

async function acquireInternalBillingNotificationMarker(
  id: string,
  eventType: string,
  payload: Prisma.InputJsonValue,
): Promise<boolean> {
  try {
    await prisma.billingWebhookEvent.create({
      data: {
        id,
        provider: "internal",
        eventType,
        status: WebhookProcessingStatus.PROCESSED,
        payload,
        processedAt: new Date(),
      },
    });
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return false;
    }

    throw error;
  }
}

async function dispatchBillingEmailNotification(
  candidate: BillingEmailNotificationCandidate,
): Promise<void> {
  const [owner, organization] = await Promise.all([
    prisma.user.findUnique({
      where: {
        id: candidate.ownerUserId,
      },
      select: {
        email: true,
        name: true,
      },
    }),
    prisma.organization.findUnique({
      where: {
        id: candidate.organizationId,
      },
      select: {
        name: true,
      },
    }),
  ]);

  const recipientEmail = owner?.email?.trim().toLowerCase() || "";
  if (!recipientEmail) {
    return;
  }

  const recipientName = owner?.name?.trim() || null;
  const organizationName = organization?.name?.trim() || "organizacao";
  const planName = getPlanDefinition(candidate.planCode).name;

  if (candidate.type === "payment-approved") {
    const markerCreated = await acquireInternalBillingNotificationMarker(
      `email:payment_approved:${candidate.organizationId}:${candidate.dedupeKey}`,
      "email.payment_approved",
      {
        organizationId: candidate.organizationId,
        ownerUserId: candidate.ownerUserId,
        dedupeKey: candidate.dedupeKey,
      },
    );
    if (!markerCreated) {
      return;
    }

    try {
      const { sendPaymentApprovedEmail } = await import("@/lib/auth/server");
      await sendPaymentApprovedEmail({
        recipientEmail,
        recipientName,
        organizationName,
        planName,
        amountCents: candidate.amountCents,
        currency: candidate.currency,
        paidAt: candidate.paidAt,
        receiptUrl: candidate.receiptUrl,
        billingUrl: candidate.billingUrl,
      });
    } catch (error) {
      console.error("Falha ao enviar e-mail de pagamento aprovado.", error);
    }
    return;
  }

  const markerCreated = await acquireInternalBillingNotificationMarker(
    `email:payment_failed_dunning:${candidate.organizationId}:${candidate.dedupeKey}`,
    "email.payment_failed_dunning",
    {
      organizationId: candidate.organizationId,
      ownerUserId: candidate.ownerUserId,
      dedupeKey: candidate.dedupeKey,
      dunningDay: candidate.dunningDay,
      graceEndsAt: candidate.graceEndsAt ? candidate.graceEndsAt.toISOString() : null,
    },
  );
  if (!markerCreated) {
    return;
  }

  try {
    const { sendPaymentFailedDunningEmail } = await import("@/lib/auth/server");
    await sendPaymentFailedDunningEmail({
      recipientEmail,
      recipientName,
      organizationName,
      planName,
      dunningDay: candidate.dunningDay,
      graceEndsAt: candidate.graceEndsAt,
      billingUrl: candidate.billingUrl,
    });
  } catch (error) {
    console.error("Falha ao enviar e-mail de falha de pagamento.", error);
  }
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
  let notificationCandidate: BillingEmailNotificationCandidate | null = null;

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
        organizationId: true,
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
        organizationId: true,
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

      notificationCandidate = {
        type: "payment-approved",
        dedupeKey: providerBillingLookupId,
        ownerUserId: checkoutSnapshot.ownerUserId,
        organizationId: checkoutSnapshot.organizationId ?? subscriptionSnapshot.organizationId,
        planCode: checkoutSnapshot.targetPlanCode,
        amountCents: checkoutSnapshot.amountCents,
        currency: checkoutSnapshot.currency,
        paidAt: now,
        receiptUrl,
        billingUrl,
      };
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
        const graceStartsAt =
          hasActiveGraceWindow && subscriptionSnapshot.currentPeriodStart
            ? subscriptionSnapshot.currentPeriodStart
            : gracePeriod.start;
        const graceEndsAt =
          hasActiveGraceWindow && subscriptionSnapshot.currentPeriodEnd
            ? subscriptionSnapshot.currentPeriodEnd
            : gracePeriod.end;

        await tx.ownerSubscription.update({
          where: {
            id: checkoutSnapshot.subscriptionId,
          },
          data: {
            status: SubscriptionStatus.PAST_DUE,
            pendingPlanCode: null,
            currentPeriodStart: graceStartsAt,
            currentPeriodEnd: graceEndsAt,
            cancelAtPeriodEnd: false,
            canceledAt: null,
          },
        });

        const dunningDay = resolveApplicableDunningEmailDay(graceStartsAt, now);
        if (dunningDay) {
          const graceToken = graceStartsAt.toISOString().slice(0, 10);
          notificationCandidate = {
            type: "payment-failed-dunning",
            dedupeKey: `${checkoutSnapshot.subscriptionId}:${graceToken}:day-${dunningDay}`,
            ownerUserId: checkoutSnapshot.ownerUserId,
            organizationId: checkoutSnapshot.organizationId ?? subscriptionSnapshot.organizationId,
            planCode: checkoutSnapshot.targetPlanCode,
            dunningDay,
            graceEndsAt,
            billingUrl,
          };
        }
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

  if (!notificationCandidate) {
    return;
  }

  try {
    await dispatchBillingEmailNotification(notificationCandidate);
  } catch (error) {
    console.error("Falha ao processar notificacao de billing por e-mail.", error);
  }
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
