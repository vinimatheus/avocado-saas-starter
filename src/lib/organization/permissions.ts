import { type OrganizationUserRole } from "@/lib/organization/helpers";

export type PermissionResource = "products" | "users";
export type PermissionAction = "create" | "read" | "update" | "delete";

export type CrudPermissions = Record<PermissionAction, boolean>;
export type ResourcePermissions = Record<PermissionResource, CrudPermissions>;

export type OrganizationPermissions = {
  admin: ResourcePermissions;
  user: ResourcePermissions;
};

function buildCrudPermissions(
  create: boolean,
  read: boolean,
  update: boolean,
  remove: boolean,
): CrudPermissions {
  return {
    create,
    read,
    update,
    delete: remove,
  };
}

function buildResourcePermissions(input: {
  products: CrudPermissions;
  users: CrudPermissions;
}): ResourcePermissions {
  return {
    products: { ...input.products },
    users: { ...input.users },
  };
}

export const defaultOrganizationPermissions: OrganizationPermissions = {
  user: buildResourcePermissions({
    products: buildCrudPermissions(true, true, true, false),
    users: buildCrudPermissions(false, false, false, false),
  }),
  admin: buildResourcePermissions({
    products: buildCrudPermissions(true, true, true, false),
    users: buildCrudPermissions(true, true, false, false),
  }),
};

export const ownerPermissions: ResourcePermissions = buildResourcePermissions({
  products: buildCrudPermissions(true, true, true, true),
  users: buildCrudPermissions(true, true, true, true),
});

type LegacyOrganizationPermissions = {
  allowMemberCreateProduct?: boolean;
  allowMemberInviteUsers?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readCrudPermissions(
  source: unknown,
  fallback: CrudPermissions,
): CrudPermissions {
  if (!isRecord(source)) {
    return { ...fallback };
  }

  return {
    create: typeof source.create === "boolean" ? source.create : fallback.create,
    read: typeof source.read === "boolean" ? source.read : fallback.read,
    update: typeof source.update === "boolean" ? source.update : fallback.update,
    delete: typeof source.delete === "boolean" ? source.delete : fallback.delete,
  };
}

function readResourcePermissions(
  source: unknown,
  fallback: ResourcePermissions,
): ResourcePermissions {
  if (!isRecord(source)) {
    return {
      products: { ...fallback.products },
      users: { ...fallback.users },
    };
  }

  return {
    products: readCrudPermissions(source.products, fallback.products),
    users: readCrudPermissions(source.users, fallback.users),
  };
}

export function resolveOrganizationPermissions(
  value: unknown,
  legacy?: LegacyOrganizationPermissions | null,
): OrganizationPermissions {
  const nextPermissions: OrganizationPermissions = {
    admin: readResourcePermissions(
      isRecord(value) ? value.admin : null,
      defaultOrganizationPermissions.admin,
    ),
    user: readResourcePermissions(
      isRecord(value) ? value.user : null,
      defaultOrganizationPermissions.user,
    ),
  };

  if (typeof legacy?.allowMemberCreateProduct === "boolean") {
    nextPermissions.user.products.create = legacy.allowMemberCreateProduct;
  }

  if (typeof legacy?.allowMemberInviteUsers === "boolean") {
    nextPermissions.user.users.create = legacy.allowMemberInviteUsers;
  }

  return nextPermissions;
}

function getRolePermissions(
  role: OrganizationUserRole | null | undefined,
  permissions: OrganizationPermissions | null | undefined,
): ResourcePermissions | null {
  if (role === "owner") {
    return ownerPermissions;
  }

  if (!permissions) {
    return null;
  }

  if (role === "admin") {
    return permissions.admin;
  }

  if (role === "user") {
    return permissions.user;
  }

  return null;
}

export function canRolePermission(
  role: OrganizationUserRole | null | undefined,
  permissions: OrganizationPermissions | null | undefined,
  resource: PermissionResource,
  action: PermissionAction,
): boolean {
  const rolePermissions = getRolePermissions(role, permissions);
  return Boolean(rolePermissions?.[resource]?.[action]);
}

export function canRoleCreateProduct(
  role: OrganizationUserRole | null | undefined,
  permissions: OrganizationPermissions | null | undefined,
): boolean {
  return canRolePermission(role, permissions, "products", "create");
}

export function canRoleReadProducts(
  role: OrganizationUserRole | null | undefined,
  permissions: OrganizationPermissions | null | undefined,
): boolean {
  return canRolePermission(role, permissions, "products", "read");
}

export function canRoleUpdateProducts(
  role: OrganizationUserRole | null | undefined,
  permissions: OrganizationPermissions | null | undefined,
): boolean {
  return canRolePermission(role, permissions, "products", "update");
}

export function canRoleDeleteProducts(
  role: OrganizationUserRole | null | undefined,
  permissions: OrganizationPermissions | null | undefined,
): boolean {
  return canRolePermission(role, permissions, "products", "delete");
}

export function canRoleCreateUsers(
  role: OrganizationUserRole | null | undefined,
  permissions: OrganizationPermissions | null | undefined,
): boolean {
  return canRolePermission(role, permissions, "users", "create");
}

export function canRoleReadUsers(
  role: OrganizationUserRole | null | undefined,
  permissions: OrganizationPermissions | null | undefined,
): boolean {
  return canRolePermission(role, permissions, "users", "read");
}

export function canRoleUpdateUsers(
  role: OrganizationUserRole | null | undefined,
  permissions: OrganizationPermissions | null | undefined,
): boolean {
  return canRolePermission(role, permissions, "users", "update");
}

export function canRoleDeleteUsers(
  role: OrganizationUserRole | null | undefined,
  permissions: OrganizationPermissions | null | undefined,
): boolean {
  return canRolePermission(role, permissions, "users", "delete");
}

export function canRoleInviteUsers(
  role: OrganizationUserRole | null | undefined,
  permissions: OrganizationPermissions | null | undefined,
): boolean {
  return canRoleCreateUsers(role, permissions);
}
