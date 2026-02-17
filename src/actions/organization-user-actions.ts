"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { OrganizationUserActionState } from "@/actions/organization-user-action-state";
import { auth, sendMemberRemovedFromOrganizationEmail } from "@/lib/auth/server";
import { assertOrganizationNotBlockedAfterExpiredTrial } from "@/lib/billing/subscription-service";
import { prisma } from "@/lib/db/prisma";
import {
  hasOrganizationRole,
  isOrganizationAdminRole,
  isOrganizationOwnerRole,
  toOrganizationMemberRole,
  type OrganizationUserRole,
} from "@/lib/organization/helpers";
import { canRoleInviteUsers, type OrganizationPermissions } from "@/lib/organization/permissions";
import { getTenantContext } from "@/lib/organization/tenant-context";
import { organizationAssignableRoleSchema } from "@/lib/users/schemas";

const USER_MANAGEMENT_PATHS = ["/dashboard", "/profile"] as const;

const inviteMemberSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Informe um e-mail valido.")
    .max(120, "E-mail deve ter no maximo 120 caracteres."),
  role: organizationAssignableRoleSchema,
});

const updateMemberRoleSchema = z.object({
  memberId: z.string().trim().min(1, "Membro nao informado."),
  role: organizationAssignableRoleSchema,
});

const removeMemberSchema = z.object({
  memberId: z.string().trim().min(1, "Membro nao informado."),
});

const invitationSchema = z.object({
  invitationId: z.string().trim().min(1, "Convite nao informado."),
});

const resendInvitationSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Informe um e-mail valido.")
    .max(120, "E-mail deve ter no maximo 120 caracteres."),
  role: organizationAssignableRoleSchema,
});

function successState(
  message: string,
  redirectTo: string | null = null,
): OrganizationUserActionState {
  return {
    status: "success",
    message,
    redirectTo,
  };
}

function errorState(message: string): OrganizationUserActionState {
  return {
    status: "error",
    message,
    redirectTo: null,
  };
}

function parseActionError(error: unknown, fallbackMessage: string): string {
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

  return fallbackMessage;
}

function revalidateUserManagementPaths() {
  for (const path of USER_MANAGEMENT_PATHS) {
    revalidatePath(path);
  }
}

type OrganizationActionContext = {
  organizationId: string;
  organizationName: string | null;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  role: OrganizationUserRole | null;
  permissions: OrganizationPermissions;
  requestHeaders: Headers;
};

async function getUserActionContext(): Promise<OrganizationActionContext> {
  const tenantContext = await getTenantContext();
  if (!tenantContext.session?.user) {
    throw new Error("Sessao invalida para gerenciar usuarios.");
  }
  if (!tenantContext.organizationId) {
    throw new Error("Usuario sem organizacao ativa.");
  }

  await assertOrganizationNotBlockedAfterExpiredTrial(tenantContext.organizationId);

  return {
    organizationId: tenantContext.organizationId,
    organizationName: tenantContext.organizationName,
    userId: tenantContext.session.user.id,
    userName: tenantContext.session.user.name?.trim() || null,
    userEmail: tenantContext.session.user.email?.trim() || null,
    role: tenantContext.role,
    permissions: tenantContext.permissions,
    requestHeaders: await headers(),
  };
}

async function getAdminActionContext(): Promise<OrganizationActionContext & { role: OrganizationUserRole }> {
  const context = await getUserActionContext();
  if (!isOrganizationAdminRole(context.role)) {
    throw new Error("Somente administradores podem gerenciar usuarios.");
  }

  return {
    ...context,
    role: context.role,
  };
}

async function getInviteActionContext(): Promise<OrganizationActionContext> {
  const context = await getUserActionContext();
  if (!canRoleInviteUsers(context.role, context.permissions)) {
    throw new Error("Voce nao tem permissao para gerenciar convites.");
  }

  return context;
}

function getFormValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function inviteOrganizationUserAction(
  _previousState: OrganizationUserActionState,
  formData: FormData,
): Promise<OrganizationUserActionState> {
  try {
    const context = await getInviteActionContext();
    const parsed = inviteMemberSchema.safeParse({
      email: getFormValue(formData, "email"),
      role: getFormValue(formData, "role"),
    });

    if (!parsed.success) {
      return errorState(parsed.error.issues[0]?.message ?? "Dados invalidos para convite.");
    }

    if (parsed.data.role === "admin" && !isOrganizationOwnerRole(context.role)) {
      return errorState("Somente o proprietario pode convidar novos administradores.");
    }

    const normalizedEmail = parsed.data.email.toLowerCase();
    await auth.api.createInvitation({
      headers: context.requestHeaders,
      body: {
        organizationId: context.organizationId,
        email: normalizedEmail,
        role: toOrganizationMemberRole(parsed.data.role),
        resend: true,
      },
    });

    revalidateUserManagementPaths();
    return successState(`Convite enviado para ${normalizedEmail}.`);
  } catch (error) {
    return errorState(parseActionError(error, "Falha ao enviar convite."));
  }
}

export async function resendOrganizationInvitationAction(
  _previousState: OrganizationUserActionState,
  formData: FormData,
): Promise<OrganizationUserActionState> {
  try {
    const context = await getInviteActionContext();
    const parsed = resendInvitationSchema.safeParse({
      email: getFormValue(formData, "email"),
      role: getFormValue(formData, "role"),
    });

    if (!parsed.success) {
      return errorState(parsed.error.issues[0]?.message ?? "Dados invalidos para reenvio.");
    }

    if (parsed.data.role === "admin" && !isOrganizationOwnerRole(context.role)) {
      return errorState("Somente o proprietario pode convidar novos administradores.");
    }

    const normalizedEmail = parsed.data.email.toLowerCase();
    await auth.api.createInvitation({
      headers: context.requestHeaders,
      body: {
        organizationId: context.organizationId,
        email: normalizedEmail,
        role: toOrganizationMemberRole(parsed.data.role),
        resend: true,
      },
    });

    revalidateUserManagementPaths();
    return successState(`Convite reenviado para ${normalizedEmail}.`);
  } catch (error) {
    return errorState(parseActionError(error, "Falha ao reenviar convite."));
  }
}

export async function cancelOrganizationInvitationAction(
  _previousState: OrganizationUserActionState,
  formData: FormData,
): Promise<OrganizationUserActionState> {
  try {
    const context = await getInviteActionContext();
    const parsed = invitationSchema.safeParse({
      invitationId: getFormValue(formData, "invitationId"),
    });

    if (!parsed.success) {
      return errorState(parsed.error.issues[0]?.message ?? "Convite invalido.");
    }

    await auth.api.cancelInvitation({
      headers: context.requestHeaders,
      body: {
        invitationId: parsed.data.invitationId,
      },
    });

    revalidateUserManagementPaths();
    return successState("Convite cancelado com sucesso.");
  } catch (error) {
    return errorState(parseActionError(error, "Falha ao cancelar convite."));
  }
}

export async function updateOrganizationMemberRoleAction(
  _previousState: OrganizationUserActionState,
  formData: FormData,
): Promise<OrganizationUserActionState> {
  try {
    const context = await getAdminActionContext();
    const parsed = updateMemberRoleSchema.safeParse({
      memberId: getFormValue(formData, "memberId"),
      role: getFormValue(formData, "role"),
    });

    if (!parsed.success) {
      return errorState(parsed.error.issues[0]?.message ?? "Dados invalidos para alterar cargo.");
    }

    if (parsed.data.role === "admin" && !isOrganizationOwnerRole(context.role)) {
      return errorState("Somente o proprietario pode promover membros para administrador.");
    }

    const membersResult = await auth.api.listMembers({
      headers: context.requestHeaders,
      query: {
        organizationId: context.organizationId,
        limit: 500,
      },
    });

    const targetMember = membersResult.members.find((member) => member.id === parsed.data.memberId);
    if (!targetMember) {
      return errorState("Membro nao encontrado na organizacao.");
    }

    if (hasOrganizationRole(targetMember.role, "owner")) {
      return errorState("Use transferencia de propriedade para alterar o proprietario.");
    }

    await auth.api.updateMemberRole({
      headers: context.requestHeaders,
      body: {
        organizationId: context.organizationId,
        memberId: parsed.data.memberId,
        role: toOrganizationMemberRole(parsed.data.role),
      },
    });

    revalidateUserManagementPaths();
    return successState("Cargo atualizado com sucesso.");
  } catch (error) {
    return errorState(parseActionError(error, "Falha ao alterar cargo."));
  }
}

export async function removeOrganizationMemberAction(
  _previousState: OrganizationUserActionState,
  formData: FormData,
): Promise<OrganizationUserActionState> {
  try {
    const context = await getAdminActionContext();
    const parsed = removeMemberSchema.safeParse({
      memberId: getFormValue(formData, "memberId"),
    });

    if (!parsed.success) {
      return errorState(parsed.error.issues[0]?.message ?? "Dados invalidos para remover usuario.");
    }

    const membersResult = await auth.api.listMembers({
      headers: context.requestHeaders,
      query: {
        organizationId: context.organizationId,
        limit: 500,
      },
    });
    const targetMember = membersResult.members.find((member) => member.id === parsed.data.memberId);
    if (!targetMember) {
      return errorState("Membro nao encontrado na organizacao.");
    }

    if (targetMember.userId === context.userId) {
      return errorState("Nao e permitido remover o proprio usuario nesta tela.");
    }

    if (hasOrganizationRole(targetMember.role, "owner")) {
      return errorState("Proprietario nao pode ser removido por esta operacao.");
    }

    let removedUserEmail = targetMember.user?.email?.trim().toLowerCase() || "";
    let removedUserName = targetMember.user?.name?.trim() || null;
    if (!removedUserEmail) {
      const removedUser = await prisma.user.findUnique({
        where: {
          id: targetMember.userId,
        },
        select: {
          email: true,
          name: true,
        },
      });
      removedUserEmail = removedUser?.email?.trim().toLowerCase() || "";
      if (!removedUserName) {
        removedUserName = removedUser?.name?.trim() || null;
      }
    }

    await auth.api.removeMember({
      headers: context.requestHeaders,
      body: {
        organizationId: context.organizationId,
        memberIdOrEmail: parsed.data.memberId,
      },
    });

    if (removedUserEmail) {
      await sendMemberRemovedFromOrganizationEmail({
        recipientEmail: removedUserEmail,
        recipientName: removedUserName,
        organizationName: context.organizationName || "organizacao ativa",
        removedByName: context.userName || context.userEmail || undefined,
      }).catch((error) => {
        console.error("Falha ao enviar e-mail de usuario removido.", error);
      });
    }

    revalidateUserManagementPaths();
    return successState("Usuario removido com sucesso.");
  } catch (error) {
    return errorState(parseActionError(error, "Falha ao remover usuario."));
  }
}

async function getAuthenticatedHeaders(): Promise<Headers | null> {
  const tenantContext = await getTenantContext();
  if (!tenantContext.session?.user) {
    return null;
  }

  return headers();
}

export async function acceptOrganizationInvitationAction(
  _previousState: OrganizationUserActionState,
  formData: FormData,
): Promise<OrganizationUserActionState> {
  try {
    const requestHeaders = await getAuthenticatedHeaders();
    if (!requestHeaders) {
      return errorState("Faca login para aceitar o convite.");
    }

    const parsed = invitationSchema.safeParse({
      invitationId: getFormValue(formData, "invitationId"),
    });

    if (!parsed.success) {
      return errorState(parsed.error.issues[0]?.message ?? "Convite invalido.");
    }

    await auth.api.acceptInvitation({
      headers: requestHeaders,
      body: {
        invitationId: parsed.data.invitationId,
      },
    });

    return successState("Convite aceito com sucesso.", "/dashboard");
  } catch (error) {
    return errorState(parseActionError(error, "Falha ao aceitar convite."));
  }
}

export async function rejectOrganizationInvitationAction(
  _previousState: OrganizationUserActionState,
  formData: FormData,
): Promise<OrganizationUserActionState> {
  try {
    const requestHeaders = await getAuthenticatedHeaders();
    if (!requestHeaders) {
      return errorState("Faca login para recusar o convite.");
    }

    const parsed = invitationSchema.safeParse({
      invitationId: getFormValue(formData, "invitationId"),
    });

    if (!parsed.success) {
      return errorState(parsed.error.issues[0]?.message ?? "Convite invalido.");
    }

    await auth.api.rejectInvitation({
      headers: requestHeaders,
      body: {
        invitationId: parsed.data.invitationId,
      },
    });

    const tenantContext = await getTenantContext();
    return successState(
      "Convite recusado.",
      tenantContext.organizationId ? "/dashboard" : "/onboarding/company",
    );
  } catch (error) {
    return errorState(parseActionError(error, "Falha ao recusar convite."));
  }
}
