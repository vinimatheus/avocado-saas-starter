export type OrganizationUserRole = "owner" | "admin" | "user";

type OrganizationMemberRoleToken = "owner" | "admin" | "member";

function normalizeRoleTokens(role: string | null | undefined): string[] {
  return (role ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function hasOrganizationRole(
  role: string | null | undefined,
  expectedRole: OrganizationMemberRoleToken,
): boolean {
  return normalizeRoleTokens(role).includes(expectedRole);
}

function normalizeSlugPart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeOrganizationRole(role: string | null | undefined): OrganizationUserRole {
  if (hasOrganizationRole(role, "owner")) {
    return "owner";
  }

  if (hasOrganizationRole(role, "admin")) {
    return "admin";
  }

  return "user";
}

export function isOrganizationAdminRole(
  role: OrganizationUserRole | null | undefined,
): role is "owner" | "admin" {
  return role === "owner" || role === "admin";
}

export function isOrganizationOwnerRole(
  role: OrganizationUserRole | null | undefined,
): role is "owner" {
  return role === "owner";
}

export function toOrganizationMemberRole(role: OrganizationUserRole): "owner" | "admin" | "member" {
  if (role === "user") {
    return "member";
  }

  return role;
}

export function buildOrganizationSlug(companyName: string, email: string): string {
  const companyPart = normalizeSlugPart(companyName).slice(0, 40);
  const emailPart = normalizeSlugPart(email).slice(0, 24);

  const segments = [companyPart || "empresa", emailPart || "conta"];
  return segments.join("-").slice(0, 70);
}
