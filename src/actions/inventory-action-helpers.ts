import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import type { InventoryActionState } from "@/actions/inventory-action-state";
import { isOrganizationAdminRole, type OrganizationUserRole } from "@/lib/organization";
import { getTenantContext } from "@/lib/tenant-context";

const INVENTORY_PATHS = [
  "/",
  "/visao-geral",
  "/indicadores",
  "/cadastros",
  "/cadastros/localizacao",
  "/cadastros/localizacao-massa",
  "/cadastros/pallet",
  "/cadastros/produto",
] as const;

type SuccessMessageInput = string | (() => string);

export type TenantMutationContext = {
  organizationId: string;
  userId: string;
  role: OrganizationUserRole;
};

function successState(message: string): InventoryActionState {
  return { status: "success", message };
}

function errorState(message: string): InventoryActionState {
  return { status: "error", message };
}

function parseActionError(error: unknown): string {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return "Banco indisponivel. Confirme DATABASE_URL e se o PostgreSQL esta rodando.";
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return "Registro duplicado para um campo unico.";
    }

    if (error.code === "P2003") {
      return "Nao foi possivel excluir: existem registros de inventario vinculados.";
    }

    if (error.code === "P2025") {
      return "Registro nao encontrado.";
    }

    return `Falha de banco (${error.code}).`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Erro inesperado ao processar a acao.";
}

function resolveSuccessMessage(message: SuccessMessageInput): string {
  return typeof message === "function" ? message() : message;
}

function revalidateInventoryPaths(additionalPaths: readonly string[] = []): void {
  const paths = new Set<string>([...INVENTORY_PATHS, ...additionalPaths]);
  for (const path of paths) {
    revalidatePath(path);
  }
}

async function getAdminTenantMutationContext(): Promise<TenantMutationContext> {
  const tenantContext = await getTenantContext();
  if (!tenantContext.session?.user) {
    throw new Error("Sessao invalida para executar a acao.");
  }

  if (!tenantContext.organizationId) {
    throw new Error("Usuario sem empresa ativa.");
  }

  const role = tenantContext.role ?? "user";
  if (!isOrganizationAdminRole(role)) {
    throw new Error("Somente administradores podem executar esta acao.");
  }

  return {
    organizationId: tenantContext.organizationId,
    userId: tenantContext.session.user.id,
    role,
  };
}

export async function runAdminInventoryMutation(
  mutation: (context: TenantMutationContext) => Promise<void>,
  successMessage: SuccessMessageInput,
  options: { revalidatePaths?: string[] } = {},
): Promise<InventoryActionState> {
  try {
    const tenantContext = await getAdminTenantMutationContext();
    await mutation(tenantContext);
    revalidateInventoryPaths(options.revalidatePaths ?? []);
    return successState(resolveSuccessMessage(successMessage));
  } catch (error) {
    return errorState(parseActionError(error));
  }
}
