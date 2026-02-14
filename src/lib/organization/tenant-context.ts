import { headers } from "next/headers";
import { cache } from "react";

import { auth } from "@/lib/auth/server";
import { isPaidPlan } from "@/lib/billing/plans";
import { normalizeOrganizationRole, type OrganizationUserRole } from "@/lib/organization/helpers";
import { prisma } from "@/lib/db/prisma";

export type TenantContext = {
  session: Awaited<ReturnType<typeof auth.api.getSession>>;
  organizationId: string | null;
  organizationName: string | null;
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    isPremium: boolean;
  }>;
  role: OrganizationUserRole | null;
};

const ROLE_NORMALIZATION_CACHE_TTL_MS = 5 * 60 * 1000;
const ROLE_NORMALIZATION_CACHE_MAX = 500;
const normalizedOrganizationRolesCache = new Map<string, number>();

function hasRecentRoleNormalization(organizationId: string): boolean {
  const normalizedAt = normalizedOrganizationRolesCache.get(organizationId);
  if (!normalizedAt) {
    return false;
  }

  if (Date.now() - normalizedAt > ROLE_NORMALIZATION_CACHE_TTL_MS) {
    normalizedOrganizationRolesCache.delete(organizationId);
    return false;
  }

  return true;
}

function cacheRoleNormalization(organizationId: string): void {
  normalizedOrganizationRolesCache.set(organizationId, Date.now());

  if (normalizedOrganizationRolesCache.size <= ROLE_NORMALIZATION_CACHE_MAX) {
    return;
  }

  const oldestKey = normalizedOrganizationRolesCache.keys().next().value;
  if (oldestKey) {
    normalizedOrganizationRolesCache.delete(oldestKey);
  }
}

function normalizeOrganizationLogo(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

type OrganizationBillingSnapshot = {
  organizationId: string;
  planCode: "FREE" | "STARTER_50" | "PRO_100" | "SCALE_400";
  trialPlanCode: "FREE" | "STARTER_50" | "PRO_100" | "SCALE_400" | null;
  status: "FREE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
};

function isPremiumOrganization(
  subscription: OrganizationBillingSnapshot | null | undefined,
): boolean {
  if (!subscription) {
    return false;
  }

  const now = new Date();
  if (
    subscription.status === "TRIALING" &&
    subscription.trialPlanCode &&
    subscription.trialEndsAt &&
    subscription.trialEndsAt > now
  ) {
    return isPaidPlan(subscription.trialPlanCode);
  }

  if (
    (subscription.status === "ACTIVE" || subscription.status === "PAST_DUE") &&
    subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd > now
  ) {
    return isPaidPlan(subscription.planCode);
  }

  return false;
}

async function ensureOrganizationRolesNormalized(organizationId: string): Promise<void> {
  if (hasRecentRoleNormalization(organizationId)) {
    return;
  }

  await normalizeOrganizationRoles(organizationId);
  cacheRoleNormalization(organizationId);
}

async function normalizeOrganizationRoles(organizationId: string): Promise<void> {
  await prisma.member.updateMany({
    where: {
      organizationId,
      role: "user",
    },
    data: {
      role: "member",
    },
  });

  const ownerCount = await prisma.member.count({
    where: {
      organizationId,
      role: {
        contains: "owner",
      },
    },
  });
  if (ownerCount > 0) {
    return;
  }

  const adminCandidate = await prisma.member.findFirst({
    where: {
      organizationId,
      role: {
        contains: "admin",
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
    },
  });

  if (adminCandidate) {
    await prisma.member.update({
      where: {
        id: adminCandidate.id,
      },
      data: {
        role: "owner",
      },
    });
    return;
  }

  const memberCandidate = await prisma.member.findFirst({
    where: {
      organizationId,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
    },
  });
  if (!memberCandidate) {
    return;
  }

  await prisma.member.update({
    where: {
      id: memberCandidate.id,
    },
    data: {
      role: "owner",
    },
  });
}

async function resolveTenantContext(): Promise<TenantContext> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });

  if (!session?.user) {
    return {
      session,
      organizationId: null,
      organizationName: null,
      organizations: [],
      role: null,
    };
  }

  const organizations = await auth.api
    .listOrganizations({
      headers: requestHeaders,
    })
    .catch(() => []);

  const organizationSubscriptions =
    organizations.length > 0
      ? await prisma.ownerSubscription.findMany({
          where: {
            organizationId: {
              in: organizations.map((organization) => organization.id),
            },
          },
          select: {
            organizationId: true,
            planCode: true,
            trialPlanCode: true,
            status: true,
            trialEndsAt: true,
            currentPeriodEnd: true,
          },
        })
      : [];
  const subscriptionByOrganizationId = new Map(
    organizationSubscriptions.map((subscription) => [subscription.organizationId, subscription]),
  );
  const organizationsWithBillingState = organizations.map((organization) => ({
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    logo: normalizeOrganizationLogo((organization as { logo?: unknown }).logo),
    isPremium: isPremiumOrganization(
      subscriptionByOrganizationId.get(organization.id) as OrganizationBillingSnapshot | undefined,
    ),
  }));

  const activeOrganizationId = session.session.activeOrganizationId ?? null;
  const activeOrganization = organizations.find((organization) => organization.id === activeOrganizationId);
  const fallbackOrganization = organizations[0] ?? null;
  const selectedOrganization = activeOrganization ?? fallbackOrganization;

  if (!selectedOrganization) {
    return {
      session,
      organizationId: null,
      organizationName: null,
      organizations: [],
      role: null,
    };
  }

  if (activeOrganizationId !== selectedOrganization.id) {
    try {
      await auth.api.setActiveOrganization({
        headers: requestHeaders,
        body: {
          organizationId: selectedOrganization.id,
        },
      });
    } catch {
      // If setting the active organization fails, the role lookup below still guards access.
    }
  }

  await ensureOrganizationRolesNormalized(selectedOrganization.id);

  const membership = await prisma.member.findUnique({
    where: {
      organizationId_userId: {
        organizationId: selectedOrganization.id,
        userId: session.user.id,
      },
    },
    select: {
      role: true,
    },
  });

  if (!membership) {
    return {
      session,
      organizationId: null,
      organizationName: null,
      organizations: organizationsWithBillingState,
      role: null,
    };
  }

  return {
    session,
    organizationId: selectedOrganization.id,
    organizationName: selectedOrganization.name,
    organizations: organizationsWithBillingState,
    role: normalizeOrganizationRole(membership.role),
  };
}

export const getTenantContext = cache(resolveTenantContext);
