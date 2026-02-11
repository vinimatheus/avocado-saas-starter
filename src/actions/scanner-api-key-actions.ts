"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import type { ScannerApiKeyActionState } from "@/actions/scanner-api-key-action-state";
import { auth } from "@/lib/auth";
import { isOrganizationAdminRole } from "@/lib/organization";
import { getTenantContext } from "@/lib/tenant-context";

const SCANNER_KEY_PATHS = ["/integracoes/chaves-scanner", "/cadastros"] as const;

type LegacyApiKeyApi = {
  createApiKey?: (input: { headers: Headers; body: { name: string } }) => Promise<{ key: string }>;
  deleteApiKey?: (input: { headers: Headers; body: { keyId: string } }) => Promise<void>;
};

function successState(
  message: string,
  plainApiKey: string | null = null,
): ScannerApiKeyActionState {
  return {
    status: "success",
    message,
    plainApiKey,
  };
}

function errorState(message: string): ScannerApiKeyActionState {
  return {
    status: "error",
    message,
    plainApiKey: null,
  };
}

function revalidateScannerKeyPaths() {
  for (const path of SCANNER_KEY_PATHS) {
    revalidatePath(path);
  }
}

function getLegacyApiKeyApi(): LegacyApiKeyApi {
  return auth.api as unknown as LegacyApiKeyApi;
}

export async function createScannerApiKeyAction(
  _previousState: ScannerApiKeyActionState,
  formData: FormData,
): Promise<ScannerApiKeyActionState> {
  try {
    const tenantContext = await getTenantContext();
    if (!tenantContext.session?.user) {
      return errorState("Sessao invalida para criar chave.");
    }
    if (!tenantContext.organizationId) {
      return errorState("Usuario sem empresa ativa.");
    }
    if (!isOrganizationAdminRole(tenantContext.role)) {
      return errorState("Somente administradores podem criar chaves.");
    }

    const name = String(formData.get("name") ?? "").trim();
    if (name.length < 3) {
      return errorState("Nome da chave deve ter ao menos 3 caracteres.");
    }

    const api = getLegacyApiKeyApi();
    if (!api.createApiKey) {
      return errorState("API de chaves do scanner indisponivel nesta configuracao.");
    }

    const createdApiKey = await api.createApiKey({
      headers: await headers(),
      body: {
        name,
      },
    });

    revalidateScannerKeyPaths();
    return successState(
      "Chave criada com sucesso. Copie agora, ela nao sera exibida novamente.",
      createdApiKey.key,
    );
  } catch (error) {
    if (error instanceof Error) {
      return errorState(error.message);
    }
    return errorState("Falha ao criar chave do scanner.");
  }
}

export async function revokeScannerApiKeyAction(
  _previousState: ScannerApiKeyActionState,
  formData: FormData,
): Promise<ScannerApiKeyActionState> {
  try {
    const tenantContext = await getTenantContext();
    if (!tenantContext.session?.user) {
      return errorState("Sessao invalida para revogar chave.");
    }
    if (!tenantContext.organizationId) {
      return errorState("Usuario sem empresa ativa.");
    }
    if (!isOrganizationAdminRole(tenantContext.role)) {
      return errorState("Somente administradores podem revogar chaves.");
    }

    const id = String(formData.get("id") ?? "").trim();
    if (!id) {
      return errorState("ID da chave nao informado.");
    }

    const api = getLegacyApiKeyApi();
    if (!api.deleteApiKey) {
      return errorState("API de chaves do scanner indisponivel nesta configuracao.");
    }

    await api.deleteApiKey({
      headers: await headers(),
      body: {
        keyId: id,
      },
    });

    revalidateScannerKeyPaths();
    return successState("Chave removida com sucesso.");
  } catch (error) {
    if (error instanceof Error) {
      return errorState(error.message);
    }
    return errorState("Falha ao revogar chave.");
  }
}
