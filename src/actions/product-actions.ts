"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import type { ProductActionState } from "@/actions/product-action-state";
import {
  assertOrganizationCanConsumeMonthlyUsage,
  assertOrganizationCanCreateProject,
  consumeOrganizationMonthlyUsage,
  isFeatureEnabledForOwner,
} from "@/lib/billing/subscription-service";
import { maybeSendPlanUsageThresholdAlerts } from "@/lib/auth/server";
import {
  canRoleCreateProduct,
  canRoleDeleteProducts,
  canRoleUpdateProducts,
} from "@/lib/organization/permissions";
import {
  bulkDeleteOrganizationProducts,
  bulkUpdateOrganizationProductsStatus,
  createOrganizationProduct,
  deleteOrganizationProduct,
  updateOrganizationProduct,
} from "@/lib/products/repository";
import {
  productBulkDeleteSchema,
  productBulkStatusSchema,
  productCreateSchema,
  productDeleteSchema,
  productUpdateSchema,
} from "@/lib/products/schemas";
import { getTenantContext } from "@/lib/organization/tenant-context";

const PRODUCT_PATHS = ["/produtos"] as const;

function successState(message: string): ProductActionState {
  return {
    status: "success",
    message,
  };
}

function errorState(message: string): ProductActionState {
  return {
    status: "error",
    message,
  };
}

function isSafeProductErrorMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const safeFragments = [
    "limite do plano",
    "conta em modo restrito",
    "trial gratuito de",
    "acoes em lote indisponiveis",
    "sessao invalida",
    "usuario sem organizacao ativa",
    "somente administradores",
    "nao tem permissao para cadastrar produtos",
    "nao tem permissao para atualizar produtos",
    "nao tem permissao para remover produtos",
  ];

  return safeFragments.some((fragment) => normalized.includes(fragment));
}

function parseActionError(error: unknown, fallbackMessage: string): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return "Ja existe um produto com este SKU nesta organizacao.";
    }

    if (error.code === "P2021") {
      return "Tabela de produtos ainda nao existe no banco. Execute: pnpm run prisma:push";
    }

    if (
      error.code === "P2010" &&
      typeof error.message === "string" &&
      (error.message.includes("23505") ||
        error.message.toLowerCase().includes("duplicate key value") ||
        error.message.includes("product_organization_id_sku_key"))
    ) {
      return "Ja existe um produto com este SKU nesta organizacao.";
    }

    if (
      error.code === "P2010" &&
      typeof error.message === "string" &&
      error.message.includes("23502")
    ) {
      return "Estrutura da tabela de produtos esta inconsistente. Execute: pnpm run prisma:push";
    }

    if (
      error.code === "P2010" &&
      typeof error.message === "string" &&
      (error.message.includes("42P01") ||
        error.message.toLowerCase().includes("relation \"product\" does not exist"))
    ) {
      return "Tabela de produtos ainda nao existe no banco. Execute: pnpm run prisma:push";
    }
  }

  if (error instanceof Error && error.message) {
    if (
      error.message.includes("Cannot read properties of undefined (reading 'create')") ||
      error.message.includes("Cannot read properties of undefined (reading 'findMany')")
    ) {
      return "Client Prisma desatualizado no servidor. Reinicie o dev server e tente novamente.";
    }

    if (isSafeProductErrorMessage(error.message)) {
      return error.message;
    }

    return fallbackMessage;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    if (isSafeProductErrorMessage(error.message)) {
      return error.message;
    }

    return fallbackMessage;
  }

  return fallbackMessage;
}

function getFormValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function getFormNumberValue(formData: FormData, key: string): number {
  const raw = getFormValue(formData, key).replace(",", ".");
  const parsed = Number(raw);

  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function getFormArrayValues(formData: FormData, key: string): string[] {
  const values = formData
    .getAll(key)
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (values.length > 0) {
    return values;
  }

  const fallback = getFormValue(formData, key);
  if (!fallback) {
    return [];
  }

  return fallback
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function toSku(value: string): string {
  return value.trim().toUpperCase();
}

function toDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}

function revalidateProductPaths() {
  for (const path of PRODUCT_PATHS) {
    revalidatePath(path);
  }
}

async function assertBulkProductActionsAvailable(organizationId: string): Promise<void> {
  const enabled = await isFeatureEnabledForOwner({
    organizationId,
    featureKey: "bulk_product_actions",
    subjectKey: `${organizationId}:bulk_product_actions`,
  });

  if (!enabled) {
    throw new Error("Acoes em lote indisponiveis no plano atual.");
  }
}

async function getProductContext(): Promise<{
  organizationId: string;
  role: Awaited<ReturnType<typeof getTenantContext>>["role"];
  permissions: Awaited<ReturnType<typeof getTenantContext>>["permissions"];
}> {
  const tenantContext = await getTenantContext();

  if (!tenantContext.session?.user) {
    throw new Error("Sessao invalida. Faca login novamente.");
  }

  if (!tenantContext.organizationId) {
    throw new Error("Usuario sem organizacao ativa.");
  }

  return {
    organizationId: tenantContext.organizationId,
    role: tenantContext.role,
    permissions: tenantContext.permissions,
  };
}

async function getCreateProductContext(): Promise<{ organizationId: string }> {
  const context = await getProductContext();

  if (!canRoleCreateProduct(context.role, context.permissions)) {
    throw new Error("Voce nao tem permissao para cadastrar produtos.");
  }

  return {
    organizationId: context.organizationId,
  };
}

async function getUpdateProductContext(): Promise<{ organizationId: string }> {
  const context = await getProductContext();

  if (!canRoleUpdateProducts(context.role, context.permissions)) {
    throw new Error("Voce nao tem permissao para atualizar produtos.");
  }

  return {
    organizationId: context.organizationId,
  };
}

async function getDeleteProductContext(): Promise<{ organizationId: string }> {
  const context = await getProductContext();

  if (!canRoleDeleteProducts(context.role, context.permissions)) {
    throw new Error("Voce nao tem permissao para remover produtos.");
  }

  return {
    organizationId: context.organizationId,
  };
}

export async function createProductAction(
  _previousState: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  try {
    const context = await getCreateProductContext();

    const parsed = productCreateSchema.safeParse({
      name: getFormValue(formData, "name"),
      sku: toSku(getFormValue(formData, "sku")),
      category: getFormValue(formData, "category"),
      status: getFormValue(formData, "status"),
      price: getFormNumberValue(formData, "price"),
      stock: getFormNumberValue(formData, "stock"),
    });

    if (!parsed.success) {
      return errorState(parsed.error.issues[0]?.message ?? "Dados invalidos para cadastrar produto.");
    }

    await assertOrganizationCanCreateProject(context.organizationId, 1);
    await assertOrganizationCanConsumeMonthlyUsage(context.organizationId, 1);

    await createOrganizationProduct({
      organizationId: context.organizationId,
      name: parsed.data.name,
      sku: parsed.data.sku,
      category: parsed.data.category,
      status: parsed.data.status,
      price: toDecimal(parsed.data.price),
      stock: parsed.data.stock,
    });

    await consumeOrganizationMonthlyUsage({
      organizationId: context.organizationId,
      increment: 1,
    });
    await maybeSendPlanUsageThresholdAlerts({
      organizationId: context.organizationId,
    });

    revalidateProductPaths();
    return successState("Produto cadastrado com sucesso.");
  } catch (error) {
    return errorState(parseActionError(error, "Falha ao cadastrar produto."));
  }
}

export async function upsertProductAction(
  previousState: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const productId = getFormValue(formData, "productId");
  if (productId) {
    return updateProductAction(previousState, formData);
  }

  return createProductAction(previousState, formData);
}

export async function updateProductAction(
  _previousState: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  try {
    const context = await getUpdateProductContext();

    const parsed = productUpdateSchema.safeParse({
      productId: getFormValue(formData, "productId"),
      name: getFormValue(formData, "name"),
      sku: toSku(getFormValue(formData, "sku")),
      category: getFormValue(formData, "category"),
      status: getFormValue(formData, "status"),
      price: getFormNumberValue(formData, "price"),
      stock: getFormNumberValue(formData, "stock"),
    });

    if (!parsed.success) {
      return errorState(parsed.error.issues[0]?.message ?? "Dados invalidos para atualizar produto.");
    }

    await assertOrganizationCanConsumeMonthlyUsage(context.organizationId, 1);

    const updatedCount = await updateOrganizationProduct({
      id: parsed.data.productId,
      organizationId: context.organizationId,
      name: parsed.data.name,
      sku: parsed.data.sku,
      category: parsed.data.category,
      status: parsed.data.status,
      price: toDecimal(parsed.data.price),
      stock: parsed.data.stock,
    });

    if (updatedCount === 0) {
      return errorState("Produto nao encontrado para atualizacao.");
    }

    await consumeOrganizationMonthlyUsage({
      organizationId: context.organizationId,
      increment: 1,
    });
    await maybeSendPlanUsageThresholdAlerts({
      organizationId: context.organizationId,
    });

    revalidateProductPaths();
    return successState("Produto atualizado com sucesso.");
  } catch (error) {
    return errorState(parseActionError(error, "Falha ao atualizar produto."));
  }
}

export async function deleteProductAction(
  _previousState: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  try {
    const context = await getDeleteProductContext();

    const parsed = productDeleteSchema.safeParse({
      productId: getFormValue(formData, "productId"),
    });

    if (!parsed.success) {
      return errorState(parsed.error.issues[0]?.message ?? "Produto invalido para remocao.");
    }

    await assertOrganizationCanConsumeMonthlyUsage(context.organizationId, 1);

    const deletedCount = await deleteOrganizationProduct({
      id: parsed.data.productId,
      organizationId: context.organizationId,
    });

    if (deletedCount === 0) {
      return errorState("Produto nao encontrado para remocao.");
    }

    await consumeOrganizationMonthlyUsage({
      organizationId: context.organizationId,
      increment: 1,
    });
    await maybeSendPlanUsageThresholdAlerts({
      organizationId: context.organizationId,
    });

    revalidateProductPaths();
    return successState("Produto removido com sucesso.");
  } catch (error) {
    return errorState(parseActionError(error, "Falha ao remover produto."));
  }
}

export async function bulkUpdateProductsStatusAction(
  _previousState: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  try {
    const context = await getUpdateProductContext();

    const parsed = productBulkStatusSchema.safeParse({
      productIds: getFormArrayValues(formData, "productIds"),
      status: getFormValue(formData, "status"),
    });

    if (!parsed.success) {
      return errorState(parsed.error.issues[0]?.message ?? "Dados invalidos para atualizar status.");
    }

    await assertBulkProductActionsAvailable(context.organizationId);
    await assertOrganizationCanConsumeMonthlyUsage(context.organizationId, parsed.data.productIds.length);

    const updatedCount = await bulkUpdateOrganizationProductsStatus({
      organizationId: context.organizationId,
      productIds: parsed.data.productIds,
      status: parsed.data.status,
    });

    if (updatedCount === 0) {
      return errorState("Nenhum produto selecionado foi atualizado.");
    }

    await consumeOrganizationMonthlyUsage({
      organizationId: context.organizationId,
      increment: updatedCount,
    });
    await maybeSendPlanUsageThresholdAlerts({
      organizationId: context.organizationId,
    });

    revalidateProductPaths();
    return successState(`${updatedCount} produto(s) atualizado(s).`);
  } catch (error) {
    return errorState(parseActionError(error, "Falha ao atualizar status em lote."));
  }
}

export async function bulkDeleteProductsAction(
  _previousState: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  try {
    const context = await getDeleteProductContext();

    const parsed = productBulkDeleteSchema.safeParse({
      productIds: getFormArrayValues(formData, "productIds"),
    });

    if (!parsed.success) {
      return errorState(parsed.error.issues[0]?.message ?? "Dados invalidos para remocao em lote.");
    }

    await assertBulkProductActionsAvailable(context.organizationId);
    await assertOrganizationCanConsumeMonthlyUsage(context.organizationId, parsed.data.productIds.length);

    const deletedCount = await bulkDeleteOrganizationProducts({
      organizationId: context.organizationId,
      productIds: parsed.data.productIds,
    });

    if (deletedCount === 0) {
      return errorState("Nenhum produto selecionado foi removido.");
    }

    await consumeOrganizationMonthlyUsage({
      organizationId: context.organizationId,
      increment: deletedCount,
    });
    await maybeSendPlanUsageThresholdAlerts({
      organizationId: context.organizationId,
    });

    revalidateProductPaths();
    return successState(`${deletedCount} produto(s) removido(s).`);
  } catch (error) {
    return errorState(parseActionError(error, "Falha ao remover produtos em lote."));
  }
}
