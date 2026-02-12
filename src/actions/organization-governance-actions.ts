"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import type { OrganizationUserActionState } from "@/actions/organization-user-action-state";
import { auth } from "@/lib/auth/server";
import {
  hasOrganizationRole,
  isOrganizationAdminRole,
} from "@/lib/organization/helpers";
import { getTenantContext } from "@/lib/organization/tenant-context";

const ORGANIZATION_GOVERNANCE_PATHS = [
  "/",
  "/dashboard",
  "/profile",
  "/onboarding/company",
] as const;

const transferOwnershipSchema = z.object({
  targetMemberId: z.string().trim().min(1, "Selecione o novo owner da organizacao."),
});

const updateOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe um nome com ao menos 2 caracteres.")
    .max(120, "Nome deve ter no maximo 120 caracteres."),
  slug: z
    .string()
    .trim()
    .min(2, "Informe um slug valido.")
    .max(70, "Slug deve ter no maximo 70 caracteres.")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug deve conter apenas letras minusculas, numeros e hifens."),
});

const organizationConfirmationSchema = z.object({
  organizationName: z.string().trim().min(1, "Confirme o nome da empresa para continuar."),
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

function organizationNameMatches(organizationName: string, expectedName: string | null): boolean {
  return Boolean(expectedName) && organizationName === expectedName;
}

function revalidateOrganizationGovernancePaths(): void {
  for (const path of ORGANIZATION_GOVERNANCE_PATHS) {
    revalidatePath(path);
  }
}

type GovernanceContext = {
  organizationId: string;
  organizationName: string;
  requestHeaders: Headers;
  currentUserId: string;
  currentMember: {
    id: string;
    role: string;
    user?: {
      name?: string | null;
      email?: string | null;
    };
  };
  members: Array<{
    id: string;
    userId: string;
    role: string;
    user?: {
      name?: string | null;
      email?: string | null;
    };
  }>;
  hasOwner: boolean;
  currentIsOwner: boolean;
  canManageOwnership: boolean;
};

async function getGovernanceContext(): Promise<GovernanceContext> {
  const tenantContext = await getTenantContext();
  if (!tenantContext.session?.user) {
    throw new Error("Sessao invalida. Faca login novamente.");
  }

  if (!tenantContext.organizationId || !tenantContext.organizationName) {
    throw new Error("Nenhuma empresa ativa foi encontrada.");
  }

  const requestHeaders = await headers();
  const membersResult = await auth.api.listMembers({
    headers: requestHeaders,
    query: {
      organizationId: tenantContext.organizationId,
      limit: 500,
    },
  });

  const currentMember = membersResult.members.find(
    (member) => member.userId === tenantContext.session!.user.id,
  );
  if (!currentMember) {
    throw new Error("Nao foi possivel identificar seu vinculo com a empresa ativa.");
  }

  const hasOwner = membersResult.members.some((member) => hasOrganizationRole(member.role, "owner"));
  const currentIsOwner = hasOrganizationRole(currentMember.role, "owner");
  const canManageOwnership =
    currentIsOwner || (!hasOwner && isOrganizationAdminRole(tenantContext.role));

  return {
    organizationId: tenantContext.organizationId,
    organizationName: tenantContext.organizationName,
    requestHeaders,
    currentUserId: tenantContext.session.user.id,
    currentMember,
    members: membersResult.members,
    hasOwner,
    currentIsOwner,
    canManageOwnership,
  };
}

async function resolveRedirectAfterOrganizationMutation(
  requestHeaders: Headers,
): Promise<string> {
  const organizations = await auth.api
    .listOrganizations({
      headers: requestHeaders,
    })
    .catch(() => []);

  const fallbackOrganization = organizations[0];
  if (!fallbackOrganization) {
    return "/onboarding/company";
  }

  await auth.api
    .setActiveOrganization({
      headers: requestHeaders,
      body: {
        organizationId: fallbackOrganization.id,
      },
    })
    .catch(() => undefined);

  return "/dashboard";
}

export async function updateOrganizationDetailsAction(
  _previousState: OrganizationUserActionState,
  formData: FormData,
): Promise<OrganizationUserActionState> {
  try {
    const context = await getGovernanceContext();
    if (!context.currentIsOwner) {
      return errorState("Somente o owner pode atualizar os dados da organizacao.");
    }

    const parsed = updateOrganizationSchema.safeParse({
      name: String(formData.get("name") ?? "").trim(),
      slug: String(formData.get("slug") ?? "").trim().toLowerCase(),
    });
    if (!parsed.success) {
      return errorState(parsed.error.issues[0]?.message ?? "Dados invalidos para atualizar organizacao.");
    }

    await auth.api.updateOrganization({
      headers: context.requestHeaders,
      body: {
        organizationId: context.organizationId,
        data: {
          name: parsed.data.name,
          slug: parsed.data.slug,
        },
      },
    });

    revalidateOrganizationGovernancePaths();
    return successState("Dados da organizacao atualizados com sucesso.");
  } catch (error) {
    return errorState(parseActionError(error, "Falha ao atualizar dados da organizacao."));
  }
}

export async function transferOrganizationOwnershipAction(
  _previousState: OrganizationUserActionState,
  formData: FormData,
): Promise<OrganizationUserActionState> {
  try {
    const context = await getGovernanceContext();
    if (!context.canManageOwnership) {
      return errorState("Somente o owner atual pode transferir ownership.");
    }

    const parsed = transferOwnershipSchema.safeParse({
      targetMemberId: String(formData.get("targetMemberId") ?? "").trim(),
    });
    if (!parsed.success) {
      return errorState(parsed.error.issues[0]?.message ?? "Selecione um membro valido.");
    }

    if (parsed.data.targetMemberId === context.currentMember.id) {
      return errorState("Selecione outro membro para transferir ownership.");
    }

    const targetMember = context.members.find((member) => member.id === parsed.data.targetMemberId);
    if (!targetMember) {
      return errorState("Membro selecionado nao encontrado na organizacao.");
    }

    await auth.api.updateMemberRole({
      headers: context.requestHeaders,
      body: {
        organizationId: context.organizationId,
        memberId: targetMember.id,
        role: "owner",
      },
    });

    if (context.currentIsOwner) {
      await auth.api.updateMemberRole({
        headers: context.requestHeaders,
        body: {
          organizationId: context.organizationId,
          memberId: context.currentMember.id,
          role: "admin",
        },
      });
    }

    const targetLabel =
      targetMember.user?.name?.trim() || targetMember.user?.email || "membro selecionado";
    revalidateOrganizationGovernancePaths();
    return successState(`Ownership transferido para ${targetLabel}.`);
  } catch (error) {
    return errorState(parseActionError(error, "Falha ao transferir ownership."));
  }
}

export async function leaveOrganizationSafelyAction(
  _previousState: OrganizationUserActionState,
  formData: FormData,
): Promise<OrganizationUserActionState> {
  try {
    const context = await getGovernanceContext();
    const parsed = organizationConfirmationSchema.safeParse({
      organizationName: String(formData.get("organizationName") ?? "").trim(),
    });
    if (!parsed.success) {
      return errorState(parsed.error.issues[0]?.message ?? "Confirme o nome da empresa.");
    }

    if (!organizationNameMatches(parsed.data.organizationName, context.organizationName)) {
      return errorState("O nome informado nao corresponde a empresa ativa.");
    }

    if (context.currentIsOwner) {
      const ownerCount = context.members.filter((member) => hasOrganizationRole(member.role, "owner")).length;
      if (ownerCount <= 1) {
        return errorState(
          "Transfira ownership para outro membro antes de sair da organizacao.",
        );
      }
    }

    await auth.api.leaveOrganization({
      headers: context.requestHeaders,
      body: {
        organizationId: context.organizationId,
      },
    });

    const redirectTo = await resolveRedirectAfterOrganizationMutation(context.requestHeaders);
    revalidateOrganizationGovernancePaths();
    return successState("Voce saiu da organizacao com sucesso.", redirectTo);
  } catch (error) {
    return errorState(parseActionError(error, "Falha ao sair da organizacao."));
  }
}

export async function deleteOrganizationSafelyAction(
  _previousState: OrganizationUserActionState,
  formData: FormData,
): Promise<OrganizationUserActionState> {
  try {
    const context = await getGovernanceContext();
    const parsed = organizationConfirmationSchema.safeParse({
      organizationName: String(formData.get("organizationName") ?? "").trim(),
    });
    if (!parsed.success) {
      return errorState(parsed.error.issues[0]?.message ?? "Confirme o nome da empresa.");
    }

    if (!organizationNameMatches(parsed.data.organizationName, context.organizationName)) {
      return errorState("O nome informado nao corresponde a empresa ativa.");
    }

    if (!context.canManageOwnership) {
      return errorState("Somente o owner atual pode excluir a organizacao.");
    }

    if (!context.currentIsOwner) {
      await auth.api.updateMemberRole({
        headers: context.requestHeaders,
        body: {
          organizationId: context.organizationId,
          memberId: context.currentMember.id,
          role: "owner",
        },
      });
    }

    await auth.api.deleteOrganization({
      headers: context.requestHeaders,
      body: {
        organizationId: context.organizationId,
      },
    });

    const redirectTo = await resolveRedirectAfterOrganizationMutation(context.requestHeaders);
    revalidateOrganizationGovernancePaths();
    return successState("Organizacao excluida com sucesso.", redirectTo);
  } catch (error) {
    return errorState(parseActionError(error, "Falha ao excluir organizacao."));
  }
}
