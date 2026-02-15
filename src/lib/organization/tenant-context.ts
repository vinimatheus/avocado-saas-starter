import { headers } from "next/headers";
import { cache } from "react";

import { auth } from "@/lib/auth/server";
import { getPlanDefinition, isPaidPlan } from "@/lib/billing/plans";
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
    planCode: "FREE" | "STARTER_50" | "PRO_100" | "SCALE_400";
    planName: string;
    isPremium: boolean;
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
    (subscription.status === "ACTIVE" || subscription.status === "PAST_DUE") &&
    subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd > now
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
      planCode,
      planName: getPlanDefinition(planCode).name,
      isPremium: isPaidPlan(planCode),
    };
  });

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
