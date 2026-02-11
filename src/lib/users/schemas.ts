import { z } from "zod";

export const organizationUserRoleSchema = z.enum(["owner", "admin", "user"]);
export type OrganizationUserRoleInput = z.infer<typeof organizationUserRoleSchema>;

export const organizationAssignableRoleSchema = z.enum(["admin", "user"]);
export type OrganizationAssignableRoleInput = z.infer<typeof organizationAssignableRoleSchema>;

export const organizationInviteSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Informe um e-mail valido.")
    .max(120, "E-mail deve ter no maximo 120 caracteres."),
  role: organizationAssignableRoleSchema,
});

export type OrganizationInviteValues = z.infer<typeof organizationInviteSchema>;
