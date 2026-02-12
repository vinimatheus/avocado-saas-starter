import { headers } from "next/headers";
import { cache } from "react";

import { auth } from "@/lib/auth/server";
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
      organizations: organizations.map((organization) => ({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      })),
      role: null,
    };
  }

  return {
    session,
    organizationId: selectedOrganization.id,
    organizationName: selectedOrganization.name,
    organizations: organizations.map((organization) => ({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
    })),
    role: normalizeOrganizationRole(membership.role),
  };
}

export const getTenantContext = cache(resolveTenantContext);
