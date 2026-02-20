import { auth } from "@/lib/auth/server";

const ORGANIZATION_SLUG_MAX_LENGTH = 70;

type CreateOrganizationWithSlugFallbackInput = {
  requestHeaders: Headers;
  companyName: string;
  slug: string;
  logo?: string | null;
  metadata?: Record<string, unknown> | null;
  keepCurrentActiveOrganization?: boolean;
  reuseExistingOnSlugConflict?: boolean;
};

type CreateOrganizationWithSlugFallbackResult = {
  id: string;
  name: string;
  slug: string;
  reusedExistingOrganization: boolean;
};

function parseActionError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "";
}

function generateOrganizationSlugVariant(baseSlug: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  const base = baseSlug
    .slice(0, Math.max(1, ORGANIZATION_SLUG_MAX_LENGTH - suffix.length - 1))
    .replace(/-+$/g, "");

  return `${base || "organizacao"}-${suffix}`.slice(0, ORGANIZATION_SLUG_MAX_LENGTH);
}

export async function createOrganizationWithSlugFallback(
  input: CreateOrganizationWithSlugFallbackInput,
): Promise<CreateOrganizationWithSlugFallbackResult> {
  const keepCurrentActiveOrganization = Boolean(input.keepCurrentActiveOrganization);
  const reuseExistingOnSlugConflict =
    input.reuseExistingOnSlugConflict === undefined
      ? true
      : Boolean(input.reuseExistingOnSlugConflict);

  try {
    const organization = await auth.api.createOrganization({
      headers: input.requestHeaders,
      body: {
        name: input.companyName,
        slug: input.slug,
        keepCurrentActiveOrganization,
        ...(input.logo ? { logo: input.logo } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
    });

    if (!organization) {
      throw new Error("Nao foi possivel criar organizacao.");
    }

    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      reusedExistingOrganization: false,
    };
  } catch (error) {
    const normalizedErrorMessage = parseActionError(error).trim().toLowerCase();
    const isSlugConflict =
      normalizedErrorMessage.includes("organization already exists") ||
      normalizedErrorMessage.includes("organization slug already taken") ||
      normalizedErrorMessage.includes("slug is taken");

    if (!isSlugConflict) {
      throw error;
    }
  }

  const organizations = await auth.api
    .listOrganizations({
      headers: input.requestHeaders,
    })
    .catch(() => []);

  const existingOrganization = organizations.find((organization) => organization.slug === input.slug);
  if (existingOrganization && reuseExistingOnSlugConflict) {
    if (!keepCurrentActiveOrganization) {
      await auth.api.setActiveOrganization({
        headers: input.requestHeaders,
        body: {
          organizationId: existingOrganization.id,
        },
      });
    }

    return {
      id: existingOrganization.id,
      name: existingOrganization.name,
      slug: existingOrganization.slug,
      reusedExistingOrganization: true,
    };
  }

  const fallbackOrganization = await auth.api.createOrganization({
    headers: input.requestHeaders,
    body: {
      name: input.companyName,
      slug: generateOrganizationSlugVariant(input.slug),
      keepCurrentActiveOrganization,
      ...(input.logo ? { logo: input.logo } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    },
  });

  if (!fallbackOrganization) {
    throw new Error("Nao foi possivel criar organizacao.");
  }

  return {
    id: fallbackOrganization.id,
    name: fallbackOrganization.name,
    slug: fallbackOrganization.slug,
    reusedExistingOrganization: false,
  };
}
