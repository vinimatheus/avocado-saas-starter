"use server";

import type { InventoryActionState } from "@/actions/inventory-action-state";
import { runAdminInventoryMutation } from "@/actions/inventory-action-helpers";
import { assertRequired, normalizeCode, normalizeText } from "@/lib/inventory-repository";
import { prisma } from "@/lib/prisma";

export async function upsertPalletAction(
  _previousState: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const code = normalizeCode(formData.get("code"));
  const label = normalizeText(formData.get("label"));
  const status = normalizeText(formData.get("status"));

  return runAdminInventoryMutation(async (tenantContext) => {
    assertRequired(code, "Codigo do pallet");

    await prisma.pallet.upsert({
      where: {
        organizationId_code: {
          organizationId: tenantContext.organizationId,
          code,
        },
      },
      update: { label, status },
      create: {
        organizationId: tenantContext.organizationId,
        code,
        label,
        status,
      },
    });
  }, `Pallet ${code} salvo com sucesso.`);
}

export async function deletePalletAction(
  _previousState: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const code = normalizeCode(formData.get("code"));

  return runAdminInventoryMutation(async (tenantContext) => {
    assertRequired(code, "Codigo do pallet");

    await prisma.pallet.delete({
      where: {
        organizationId_code: {
          organizationId: tenantContext.organizationId,
          code,
        },
      },
    });
  }, `Pallet ${code} excluido com sucesso.`);
}
