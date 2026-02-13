"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import type { ProfileActionState } from "@/actions/profile-action-state";
import { auth } from "@/lib/auth/server";
import {
  profileChangeEmailSchema,
  profileChangePasswordSchema,
  profileSetPasswordSchema,
  profileUpdateSchema,
} from "@/lib/auth/schemas";
import { getTenantContext } from "@/lib/organization/tenant-context";

const PROFILE_PATHS = ["/profile"] as const;
const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_PROFILE_IMAGE_FOLDER = "saas-starter/profile";

function successState(message: string): ProfileActionState {
  return {
    status: "success",
    message,
  };
}

function errorState(message: string): ProfileActionState {
  return {
    status: "error",
    message,
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

function getFormValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function getRawFormValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

function revalidateProfilePaths() {
  for (const path of PROFILE_PATHS) {
    revalidatePath(path);
  }
}

function getCloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim() || "";
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim() || "";
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim() || "";
  const folder = process.env.CLOUDINARY_PROFILE_FOLDER?.trim() || DEFAULT_PROFILE_IMAGE_FOLDER;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary nao configurado. Defina CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET.",
    );
  }

  return {
    cloudName,
    apiKey,
    apiSecret,
    folder,
  };
}

function signCloudinaryParams(params: Record<string, string>, apiSecret: string): string {
  const serializedParams = Object.entries(params)
    .filter(([, value]) => value.length > 0)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return createHash("sha1").update(`${serializedParams}${apiSecret}`).digest("hex");
}

async function uploadProfileImageToCloudinary(file: File): Promise<string> {
  const { cloudName, apiKey, apiSecret, folder } = getCloudinaryConfig();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signCloudinaryParams(
    {
      folder,
      timestamp,
    },
    apiSecret,
  );

  const payload = new FormData();
  payload.set("file", file);
  payload.set("api_key", apiKey);
  payload.set("folder", folder);
  payload.set("timestamp", timestamp);
  payload.set("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: payload,
  });

  if (!response.ok) {
    const cloudinaryError = await response.text().catch(() => "");
    throw new Error(`Falha no upload da imagem para o Cloudinary. ${cloudinaryError}`.trim());
  }

  const result = (await response.json()) as {
    secure_url?: string;
  };

  if (!result.secure_url) {
    throw new Error("Cloudinary nao retornou a URL da imagem.");
  }

  return result.secure_url;
}

export async function updateProfileAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  try {
    const tenantContext = await getTenantContext();
    if (!tenantContext.session?.user) {
      return errorState("Sessao invalida. Faca login novamente.");
    }

    const parsed = profileUpdateSchema.safeParse({
      name: getFormValue(formData, "name"),
    });

    if (!parsed.success) {
      return errorState(parsed.error.issues[0]?.message ?? "Dados invalidos para atualizar perfil.");
    }

    await auth.api.updateUser({
      headers: await headers(),
      body: {
        name: parsed.data.name,
      },
    });

    revalidateProfilePaths();
    return successState("Perfil atualizado com sucesso.");
  } catch (error) {
    return errorState(parseActionError(error, "Falha ao atualizar perfil."));
  }
}

export async function changeProfileEmailAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  try {
    const tenantContext = await getTenantContext();
    if (!tenantContext.session?.user) {
      return errorState("Sessao invalida. Faca login novamente.");
    }

    const parsed = profileChangeEmailSchema.safeParse({
      newEmail: getFormValue(formData, "newEmail"),
    });

    if (!parsed.success) {
      return errorState(parsed.error.issues[0]?.message ?? "Dados invalidos para alterar e-mail.");
    }

    const normalizedNewEmail = parsed.data.newEmail.toLowerCase();
    if (normalizedNewEmail === tenantContext.session.user.email.toLowerCase()) {
      return errorState("Informe um e-mail diferente do atual.");
    }

    await auth.api.changeEmail({
      headers: await headers(),
      body: {
        newEmail: normalizedNewEmail,
        callbackURL: "/profile",
      },
    });

    revalidateProfilePaths();
    return successState("Solicitacao enviada. Verifique o novo e-mail para concluir a troca.");
  } catch (error) {
    return errorState(parseActionError(error, "Falha ao iniciar alteracao de e-mail."));
  }
}

export async function changeProfilePasswordAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  try {
    const tenantContext = await getTenantContext();
    if (!tenantContext.session?.user) {
      return errorState("Sessao invalida. Faca login novamente.");
    }

    const parsed = profileChangePasswordSchema.safeParse({
      currentPassword: getRawFormValue(formData, "currentPassword"),
      newPassword: getRawFormValue(formData, "newPassword"),
      confirmNewPassword: getRawFormValue(formData, "confirmNewPassword"),
    });

    if (!parsed.success) {
      return errorState(parsed.error.issues[0]?.message ?? "Dados invalidos para alterar senha.");
    }

    await auth.api.changePassword({
      headers: await headers(),
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
      },
    });

    revalidateProfilePaths();
    return successState("Senha alterada com sucesso.");
  } catch (error) {
    return errorState(parseActionError(error, "Falha ao alterar senha."));
  }
}

export async function setProfilePasswordAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  try {
    const tenantContext = await getTenantContext();
    if (!tenantContext.session?.user) {
      return errorState("Sessao invalida. Faca login novamente.");
    }

    const parsed = profileSetPasswordSchema.safeParse({
      newPassword: getRawFormValue(formData, "newPassword"),
      confirmNewPassword: getRawFormValue(formData, "confirmNewPassword"),
    });

    if (!parsed.success) {
      return errorState(parsed.error.issues[0]?.message ?? "Dados invalidos para definir senha.");
    }

    await auth.api.setPassword({
      headers: await headers(),
      body: {
        newPassword: parsed.data.newPassword,
      },
    });

    revalidateProfilePaths();
    return successState("Senha definida com sucesso.");
  } catch (error) {
    return errorState(parseActionError(error, "Falha ao definir senha."));
  }
}

export async function updateProfileImageAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  try {
    const tenantContext = await getTenantContext();
    if (!tenantContext.session?.user) {
      return errorState("Sessao invalida. Faca login novamente.");
    }

    const image = formData.get("image");
    if (!(image instanceof File) || image.size === 0) {
      return errorState("Selecione uma imagem para enviar.");
    }

    if (!image.type.startsWith("image/")) {
      return errorState("Arquivo invalido. Selecione uma imagem.");
    }

    if (image.size > PROFILE_IMAGE_MAX_BYTES) {
      return errorState("A imagem deve ter no maximo 5 MB.");
    }

    const imageUrl = await uploadProfileImageToCloudinary(image);

    await auth.api.updateUser({
      headers: await headers(),
      body: {
        image: imageUrl,
      },
    });

    revalidateProfilePaths();
    return successState("Foto de perfil atualizada com sucesso.");
  } catch (error) {
    return errorState(parseActionError(error, "Falha ao salvar foto de perfil."));
  }
}
