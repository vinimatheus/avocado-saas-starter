import { isOrganizationAdminRole, type OrganizationUserRole } from "@/lib/organization/helpers";

export type OrganizationPermissions = {
  allowMemberCreateProduct: boolean;
  allowMemberInviteUsers: boolean;
};

export const defaultOrganizationPermissions: OrganizationPermissions = {
  allowMemberCreateProduct: false,
  allowMemberInviteUsers: false,
};

export function resolveOrganizationPermissions(
  value: Partial<OrganizationPermissions> | null | undefined,
): OrganizationPermissions {
  return {
    allowMemberCreateProduct: Boolean(value?.allowMemberCreateProduct),
    allowMemberInviteUsers: Boolean(value?.allowMemberInviteUsers),
  };
}

export function canRoleCreateProduct(
  role: OrganizationUserRole | null | undefined,
  permissions: OrganizationPermissions | null | undefined,
): boolean {
  if (isOrganizationAdminRole(role)) {
    return true;
  }

  return role === "user" && Boolean(permissions?.allowMemberCreateProduct);
}

export function canRoleInviteUsers(
  role: OrganizationUserRole | null | undefined,
  permissions: OrganizationPermissions | null | undefined,
): boolean {
  if (isOrganizationAdminRole(role)) {
    return true;
  }

  return role === "user" && Boolean(permissions?.allowMemberInviteUsers);
}
