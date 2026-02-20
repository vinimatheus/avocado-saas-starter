import { headers } from "next/headers";
import { cache } from "react";

import { auth } from "@/lib/auth/server";
import { getPlanDefinition, isPaidPlan } from "@/lib/billing/plans";
import { normalizeOrganizationRole, type OrganizationUserRole } from "@/lib/organization/helpers";
import {
  defaultOrganizationPermissions,
  resolveOrganizationPermissions,
  type OrganizationPermissions,
} from "@/lib/organization/permissions";
import { prisma } from "@/lib/db/prisma";

export type TenantContext = {
  session: Awaited<ReturnType<typeof auth.api.getSession>>;
  organizationId: string | null;
  organizationName: string | null;
  activeOrganizationPlatformStatus: "ACTIVE" | "BLOCKED" | null;
  activeOrganizationPlatformBlockedReason: string | null;
  permissions: OrganizationPermissions;
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    platformStatus: "ACTIVE" | "BLOCKED";
    platformBlockedReason: string | null;
    planCode: "FREE" | "STARTER_50" | "PRO_100" | "SCALE_400";
    planName: string;
    isPremium: boolean;
    subscriptionStatus: "FREE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED" | null;
    trialEndsAt: string | null;
    permissions: OrganizationPermissions;
  }>;
  role: OrganizationUserRole | null;
};

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

function resolveOrganizationPlanCode(
  subscription: OrganizationBillingSnapshot | null | undefined,
): OrganizationBillingSnapshot["planCode"] {
  if (!subscription) {
    return "FREE";
  }

  const now = new Date();
  if (
    subscription.status === "TRIALING" &&
    subscription.trialPlanCode &&
    subscription.trialEndsAt &&
    subscription.trialEndsAt > now
  ) {
    return subscription.trialPlanCode;
  }

  if (
    subscription.status === "ACTIVE" &&
    (!subscription.currentPeriodEnd || subscription.currentPeriodEnd > now)
  ) {
    return subscription.planCode;
  }

  if (
    subscription.status === "PAST_DUE" &&
    subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd > now &&
    isPaidPlan(subscription.planCode)
  ) {
    return subscription.planCode;
  }

  return "FREE";
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
      activeOrganizationPlatformStatus: null,
      activeOrganizationPlatformBlockedReason: null,
      permissions: defaultOrganizationPermissions,
      organizations: [],
      role: null,
    };
  }

  const userPlatformStatus = await prisma.user.findUnique({
    where: {
      id: session.user.id,
    },
    select: {
      platformStatus: true,
    },
  });

  if (userPlatformStatus?.platformStatus === "BLOCKED") {
    try {
      await auth.api.signOut({
        headers: requestHeaders,
      });
    } catch {
      // Ignore sign-out failures and proceed without tenant access.
    }

    return {
      session: null,
      organizationId: null,
      organizationName: null,
      activeOrganizationPlatformStatus: null,
      activeOrganizationPlatformBlockedReason: null,
      permissions: defaultOrganizationPermissions,
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
  const organizationPermissionSnapshots =
    organizations.length > 0
      ? await prisma.organization
          .findMany({
            where: {
              id: {
                in: organizations.map((organization) => organization.id),
              },
            },
            select: {
              id: true,
              allowMemberCreateProduct: true,
              allowMemberInviteUsers: true,
              rbacPermissions: true,
              platformStatus: true,
              platformBlockedReason: true,
            },
          })
          .catch((error) => {
            console.error("Falha ao carregar permissoes da organizacao.", error);
            return [];
          })
      : [];
  const subscriptionByOrganizationId = new Map(
    organizationSubscriptions.map((subscription) => [subscription.organizationId, subscription]),
  );
  const permissionsByOrganizationId = new Map(
    organizationPermissionSnapshots.map((organization) => [
      organization.id,
      resolveOrganizationPermissions(
        organization.rbacPermissions,
        {
          allowMemberCreateProduct: organization.allowMemberCreateProduct,
          allowMemberInviteUsers: organization.allowMemberInviteUsers,
        },
      ),
    ]),
  );
  const platformStatusByOrganizationId = new Map(
    organizationPermissionSnapshots.map((organization) => [
      organization.id,
      organization.platformStatus,
    ]),
  );
  const platformBlockedReasonByOrganizationId = new Map(
    organizationPermissionSnapshots.map((organization) => [
      organization.id,
      organization.platformBlockedReason ?? null,
    ]),
  );
  const organizationsWithBillingState = organizations.map((organization) => {
    const subscription = subscriptionByOrganizationId.get(
      organization.id,
    ) as OrganizationBillingSnapshot | undefined;
    const planCode = resolveOrganizationPlanCode(subscription);

    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      logo: normalizeOrganizationLogo((organization as { logo?: unknown }).logo),
      platformStatus: platformStatusByOrganizationId.get(organization.id) ?? "ACTIVE",
      platformBlockedReason: platformBlockedReasonByOrganizationId.get(organization.id) ?? null,
      planCode,
      planName: getPlanDefinition(planCode).name,
      isPremium: isPaidPlan(planCode),
      subscriptionStatus: subscription?.status ?? null,
      trialEndsAt: subscription?.trialEndsAt ? subscription.trialEndsAt.toISOString() : null,
      permissions:
        permissionsByOrganizationId.get(organization.id) ?? defaultOrganizationPermissions,
    };
  });

  const activeOrganizationId = session.session.activeOrganizationId ?? null;
  const activeOrganization = organizations.find((organization) => organization.id === activeOrganizationId);
  const activeOrganizationIsBlocked = Boolean(
    activeOrganization &&
      platformStatusByOrganizationId.get(activeOrganization.id) === "BLOCKED",
  );
  const firstUnblockedOrganization =
    organizations.find(
      (organization) => platformStatusByOrganizationId.get(organization.id) !== "BLOCKED",
    ) ?? null;
  const fallbackOrganization = firstUnblockedOrganization ?? organizations[0] ?? null;
  const selectedOrganization =
    activeOrganization && !activeOrganizationIsBlocked
      ? activeOrganization
      : fallbackOrganization;
  const selectedOrganizationPlatformStatus = selectedOrganization
    ? platformStatusByOrganizationId.get(selectedOrganization.id) ?? "ACTIVE"
    : null;
  const selectedOrganizationBlockedReason = selectedOrganization
    ? platformBlockedReasonByOrganizationId.get(selectedOrganization.id) ?? null
    : null;

  if (!selectedOrganization) {
    return {
      session,
      organizationId: null,
      organizationName: null,
      activeOrganizationPlatformStatus: null,
      activeOrganizationPlatformBlockedReason: null,
      permissions: defaultOrganizationPermissions,
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
      activeOrganizationPlatformStatus: null,
      activeOrganizationPlatformBlockedReason: null,
      permissions: defaultOrganizationPermissions,
      organizations: organizationsWithBillingState,
      role: null,
    };
  }

  return {
    session,
    organizationId: selectedOrganization.id,
    organizationName: selectedOrganization.name,
    activeOrganizationPlatformStatus: selectedOrganizationPlatformStatus,
    activeOrganizationPlatformBlockedReason: selectedOrganizationBlockedReason,
    permissions:
      permissionsByOrganizationId.get(selectedOrganization.id) ?? defaultOrganizationPermissions,
    organizations: organizationsWithBillingState,
    role: normalizeOrganizationRole(membership.role),
  };
}

export const getTenantContext = cache(resolveTenantContext);
