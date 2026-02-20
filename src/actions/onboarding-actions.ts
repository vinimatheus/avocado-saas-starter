"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { BillingPlanCode } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/lib/auth/server";
import { localizeAuthErrorMessage } from "@/lib/auth/error-messages";
import { profileUpdateSchema } from "@/lib/auth/schemas";
import { getPlanDefinition, isPaidPlan } from "@/lib/billing/plans";
import {
  assertOwnerCanCreateOrganization,
  createOrganizationCreationIntentCheckout,
} from "@/lib/billing/subscription-service";
import { buildOrganizationSlug } from "@/lib/organization/helpers";
import { createOrganizationWithSlugFallback } from "@/lib/organization/create-organization";
import { getTenantContext } from "@/lib/organization/tenant-context";
import { detectImageMimeTypeBySignature } from "@/lib/uploads/image-signature";

const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const ORGANIZATION_LOGO_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_PROFILE_IMAGE_FOLDER = "saas-starter/profile";
const DEFAULT_ORGANIZATION_LOGO_FOLDER = "avocado-saas-starter/organization";
const onboardingOrganizationSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(2, "Nome da organizacao deve ter ao menos 2 caracteres.")
    .max(120, "Nome da organizacao deve ter no maximo 120 caracteres."),
  redirectPath: z
    .string()
    .trim()
    .refine(
      (value) => value === "/" || (value.startsWith("/") && !value.startsWith("//")),
      "Destino invalido para redirecionamento.",
    ),
});

const createOrganizationWithPlanSchema = onboardingOrganizationSchema.extend({
  planCode: z.nativeEnum(BillingPlanCode),
  billingCycle: z.enum(["MONTHLY", "ANNUAL"]).catch("MONTHLY"),
  billingName: z.string().optional().catch(""),
  billingCellphone: z.string().optional().catch(""),
  billingTaxId: z.string().optional().catch(""),
  keepCurrentActiveOrganization: z
    .string()
    .trim()
    .optional()
    .transform((value) => value === "true"),
});

export type OnboardingProfileActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type OnboardingOrganizationActionState = {
  status: "idle" | "success" | "error";
  message: string;
  redirectTo: string | null;
};

export type CreateOrganizationWithPlanActionResult = {
  status: "success" | "error";
  message: string;
  redirectTo: string | null;
  redirectKind: "internal" | "external";
  intentId: string | null;
};

function successProfileState(message: string): OnboardingProfileActionState {
  return {
    status: "success",
    message,
  };
}

function errorProfileState(message: string): OnboardingProfileActionState {
  return {
    status: "error",
    message,
  };
}

function successOrganizationState(
  message: string,
  redirectTo: string,
): OnboardingOrganizationActionState {
  return {
    status: "success",
    message,
    redirectTo,
  };
}

function errorOrganizationState(message: string): OnboardingOrganizationActionState {
  return {
    status: "error",
    message,
    redirectTo: null,
  };
}

function successCreateOrganizationResult(
  message: string,
  redirectTo: string,
  redirectKind: "internal" | "external",
  intentId: string | null = null,
): CreateOrganizationWithPlanActionResult {
  return {
    status: "success",
    message,
    redirectTo,
    redirectKind,
    intentId,
  };
}

function errorCreateOrganizationResult(message: string): CreateOrganizationWithPlanActionResult {
  return {
    status: "error",
    message,
    redirectTo: null,
    redirectKind: "internal",
    intentId: null,
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

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function allDigitsEqual(value: string): boolean {
  return /^(\d)\1+$/.test(value);
}

function isValidBrazilPhone(value: string): boolean {
  if (value.length !== 10 && value.length !== 11) {
    return false;
  }

  if (allDigitsEqual(value)) {
    return false;
  }

  const ddd = Number(value.slice(0, 2));
  if (!Number.isFinite(ddd) || ddd < 11 || ddd > 99) {
    return false;
  }

  const firstLocalDigit = Number(value[2]);
  if (!Number.isFinite(firstLocalDigit)) {
    return false;
  }

  if (value.length === 11) {
    return firstLocalDigit === 9;
  }

  return firstLocalDigit >= 2 && firstLocalDigit <= 5;
}

function isValidCpf(value: string): boolean {
  if (value.length !== 11 || allDigitsEqual(value)) {
    return false;
  }

  const digits = value.split("").map(Number);
  let firstCheck = 0;
  for (let index = 0; index < 9; index += 1) {
    firstCheck += digits[index] * (10 - index);
  }

  firstCheck = (firstCheck * 10) % 11;
  if (firstCheck === 10) {
    firstCheck = 0;
  }

  if (firstCheck !== digits[9]) {
    return false;
  }

  let secondCheck = 0;
  for (let index = 0; index < 10; index += 1) {
    secondCheck += digits[index] * (11 - index);
  }

  secondCheck = (secondCheck * 10) % 11;
  if (secondCheck === 10) {
    secondCheck = 0;
  }

  return secondCheck === digits[10];
}

function isValidCnpj(value: string): boolean {
  if (value.length !== 14 || allDigitsEqual(value)) {
    return false;
  }

  const digits = value.split("").map(Number);
  const firstWeights = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const secondWeights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let firstSum = 0;
  for (let index = 0; index < firstWeights.length; index += 1) {
    firstSum += digits[index] * firstWeights[index];
  }
  const firstRemainder = firstSum % 11;
  const firstCheckDigit = firstRemainder < 2 ? 0 : 11 - firstRemainder;

  if (firstCheckDigit !== digits[12]) {
    return false;
  }

  let secondSum = 0;
  for (let index = 0; index < secondWeights.length; index += 1) {
    secondSum += digits[index] * secondWeights[index];
  }
  const secondRemainder = secondSum % 11;
  const secondCheckDigit = secondRemainder < 2 ? 0 : 11 - secondRemainder;

  return secondCheckDigit === digits[13];
}

function isValidCpfOrCnpj(value: string): boolean {
  if (value.length === 11) {
    return isValidCpf(value);
  }

  if (value.length === 14) {
    return isValidCnpj(value);
  }

  return false;
}

const onboardingBillingProfileSchema = z.object({
  billingName: z.string().trim().min(2, "Informe o nome de faturamento."),
  billingCellphone: z
    .string()
    .trim()
    .transform(onlyDigits)
    .refine(isValidBrazilPhone, "Informe um telefone valido."),
  billingTaxId: z
    .string()
    .trim()
    .transform(onlyDigits)
    .refine(isValidCpfOrCnpj, "Informe um CPF ou CNPJ valido."),
});

function getCloudinaryConfig(folderEnvKey: "CLOUDINARY_PROFILE_FOLDER" | "CLOUDINARY_ORGANIZATION_FOLDER", fallbackFolder: string) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim() || "";
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim() || "";
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim() || "";
  const folder =
    process.env[folderEnvKey]?.trim() ||
    (folderEnvKey === "CLOUDINARY_ORGANIZATION_FOLDER"
      ? process.env.CLOUDINARY_PROFILE_FOLDER?.trim() || fallbackFolder
      : fallbackFolder);

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

async function uploadImageToCloudinary(file: File, folderEnvKey: "CLOUDINARY_PROFILE_FOLDER" | "CLOUDINARY_ORGANIZATION_FOLDER", fallbackFolder: string): Promise<string> {
  const { cloudName, apiKey, apiSecret, folder } = getCloudinaryConfig(folderEnvKey, fallbackFolder);
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

function toOptionalFile(value: FormDataEntryValue | null): File | null {
  if (!(value instanceof File)) {
    return null;
  }

  if (value.size === 0) {
    return null;
  }

  return value;
}

function revalidateOnboardingPaths(): void {
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/profile");
  revalidatePath("/onboarding/company");
}

function normalizeActionErrorMessage(error: unknown, fallbackMessage: string): string {
  return localizeAuthErrorMessage(parseActionError(error, fallbackMessage));
}

async function validateAndUploadProfileImage(image: File | null): Promise<string | null> {
  if (!image) {
    return null;
  }

  if (!image.type.startsWith("image/")) {
    throw new Error("Arquivo invalido. Selecione uma imagem.");
  }

  const detectedImageMimeType = await detectImageMimeTypeBySignature(image);
  if (!detectedImageMimeType) {
    throw new Error("Arquivo invalido. Envie uma imagem PNG, JPEG, GIF ou WEBP valida.");
  }

  if (image.size > PROFILE_IMAGE_MAX_BYTES) {
    throw new Error("A imagem deve ter no maximo 5 MB.");
  }

  return uploadImageToCloudinary(image, "CLOUDINARY_PROFILE_FOLDER", DEFAULT_PROFILE_IMAGE_FOLDER);
}

async function validateAndUploadOrganizationLogo(image: File | null): Promise<string | null> {
  if (!image) {
    return null;
  }

  if (!image.type.startsWith("image/")) {
    throw new Error("Arquivo invalido. Selecione uma imagem.");
  }

  const detectedImageMimeType = await detectImageMimeTypeBySignature(image);
  if (!detectedImageMimeType) {
    throw new Error("Arquivo invalido. Envie uma imagem PNG, JPEG, GIF ou WEBP valida.");
  }

  if (image.size > ORGANIZATION_LOGO_MAX_BYTES) {
    throw new Error("A imagem deve ter no maximo 5 MB.");
  }

  return uploadImageToCloudinary(
    image,
    "CLOUDINARY_ORGANIZATION_FOLDER",
    DEFAULT_ORGANIZATION_LOGO_FOLDER,
  );
}

export async function completeOnboardingProfileStepAction(
  _previousState: OnboardingProfileActionState,
  formData: FormData,
): Promise<OnboardingProfileActionState> {
  try {
    const tenantContext = await getTenantContext();
    if (!tenantContext.session?.user) {
      return errorProfileState("Sessao invalida. Faca login novamente.");
    }

    const parsed = profileUpdateSchema.safeParse({
      name: String(formData.get("name") ?? "").trim(),
    });

    if (!parsed.success) {
      return errorProfileState(parsed.error.issues[0]?.message ?? "Dados invalidos para atualizar perfil.");
    }

    const image = toOptionalFile(formData.get("image"));
    const uploadedImageUrl = await validateAndUploadProfileImage(image);

    await auth.api.updateUser({
      headers: await headers(),
      body: {
        name: parsed.data.name,
        ...(uploadedImageUrl ? { image: uploadedImageUrl } : {}),
      },
    });

    revalidateOnboardingPaths();
    return successProfileState("Perfil salvo com sucesso.");
  } catch (error) {
    return errorProfileState(normalizeActionErrorMessage(error, "Falha ao salvar perfil inicial."));
  }
}

export async function completeOnboardingOrganizationStepAction(
  _previousState: OnboardingOrganizationActionState,
  formData: FormData,
): Promise<OnboardingOrganizationActionState> {
  try {
    const tenantContext = await getTenantContext();
    if (!tenantContext.session?.user) {
      return errorOrganizationState("Sessao invalida. Faca login novamente.");
    }

    if (tenantContext.organizationId) {
      return successOrganizationState("Organizacao ja configurada.", "/");
    }

    const parsed = onboardingOrganizationSchema.safeParse({
      companyName: String(formData.get("companyName") ?? "").trim(),
      redirectPath: String(formData.get("redirectPath") ?? "/").trim() || "/",
    });

    if (!parsed.success) {
      return errorOrganizationState(
        parsed.error.issues[0]?.message ?? "Dados invalidos para criar organizacao.",
      );
    }

    const userEmail = tenantContext.session.user.email?.trim() ?? "";
    if (!userEmail) {
      return errorOrganizationState("Nao foi possivel identificar seu e-mail. Faca login novamente.");
    }

    const image = toOptionalFile(formData.get("organizationImage"));
    const uploadedOrganizationLogoUrl = await validateAndUploadOrganizationLogo(image);
    const slug = buildOrganizationSlug(parsed.data.companyName, userEmail);

    await createOrganizationWithSlugFallback({
      requestHeaders: await headers(),
      companyName: parsed.data.companyName,
      slug,
      logo: uploadedOrganizationLogoUrl,
    });

    revalidateOnboardingPaths();
    return successOrganizationState("Organizacao configurada com sucesso.", parsed.data.redirectPath);
  } catch (error) {
    return errorOrganizationState(
      normalizeActionErrorMessage(error, "Falha ao configurar organizacao inicial."),
    );
  }
}

export async function createOrganizationWithPlanAction(
  formData: FormData,
): Promise<CreateOrganizationWithPlanActionResult> {
  try {
    const tenantContext = await getTenantContext();
    if (!tenantContext.session?.user) {
      return errorCreateOrganizationResult("Sessao invalida. Faca login novamente.");
    }

    const parsed = createOrganizationWithPlanSchema.safeParse({
      companyName: String(formData.get("companyName") ?? "").trim(),
      redirectPath: String(formData.get("redirectPath") ?? "/").trim() || "/",
      planCode: String(formData.get("planCode") ?? "").trim(),
      billingCycle: String(formData.get("billingCycle") ?? "MONTHLY").trim(),
      billingName: String(formData.get("billingName") ?? ""),
      billingCellphone: String(formData.get("billingCellphone") ?? ""),
      billingTaxId: String(formData.get("billingTaxId") ?? ""),
      keepCurrentActiveOrganization: String(
        formData.get("keepCurrentActiveOrganization") ?? "",
      ).trim(),
    });

    if (!parsed.success) {
      return errorCreateOrganizationResult(
        parsed.error.issues[0]?.message ?? "Dados invalidos para criar organizacao.",
      );
    }

    const userEmail = tenantContext.session.user.email?.trim() ?? "";
    if (!userEmail) {
      return errorCreateOrganizationResult(
        "Nao foi possivel identificar seu e-mail. Faca login novamente.",
      );
    }

    const userId = tenantContext.session.user.id?.trim() ?? "";
    if (!userId) {
      return errorCreateOrganizationResult(
        "Nao foi possivel identificar seu usuario. Faca login novamente.",
      );
    }

    const requestHeaders = await headers();
    const slug = buildOrganizationSlug(parsed.data.companyName, userEmail);
    const image = toOptionalFile(formData.get("organizationImage"));
    const uploadedOrganizationLogoUrl = await validateAndUploadOrganizationLogo(image);

    if (!isPaidPlan(parsed.data.planCode)) {
      await assertOwnerCanCreateOrganization(userId);
      await createOrganizationWithSlugFallback({
        requestHeaders,
        companyName: parsed.data.companyName,
        slug,
        logo: uploadedOrganizationLogoUrl,
        keepCurrentActiveOrganization: parsed.data.keepCurrentActiveOrganization,
      });

      revalidateOnboardingPaths();
      revalidatePath("/billing");
      revalidatePath("/empresa/nova");

      return successCreateOrganizationResult(
        "Organizacao vinculada com sucesso. Trial de 7 dias ativado para sua primeira organizacao.",
        parsed.data.redirectPath,
        "internal",
      );
    }

    const parsedBilling = onboardingBillingProfileSchema.safeParse({
      billingName: parsed.data.billingName,
      billingCellphone: parsed.data.billingCellphone,
      billingTaxId: parsed.data.billingTaxId,
    });

    if (!parsedBilling.success) {
      return errorCreateOrganizationResult(
        parsedBilling.error.issues[0]?.message ?? "Dados de faturamento invalidos.",
      );
    }

    const checkout = await createOrganizationCreationIntentCheckout({
      ownerUserId: userId,
      companyName: parsed.data.companyName,
      companySlug: slug,
      companyLogo: uploadedOrganizationLogoUrl,
      targetPlanCode: parsed.data.planCode,
      billingCycle: parsed.data.billingCycle,
      billingName: parsedBilling.data.billingName,
      billingCellphone: parsedBilling.data.billingCellphone,
      billingTaxId: parsedBilling.data.billingTaxId,
    });

    revalidatePath("/empresa/nova");

    const planName = getPlanDefinition(parsed.data.planCode).name;
    if (!parsed.data.keepCurrentActiveOrganization) {
      return successCreateOrganizationResult(
        `Pagamento iniciado para o plano ${planName}. A organizacao sera criada somente apos aprovacao.`,
        checkout.checkoutUrl,
        "external",
        checkout.intentId,
      );
    }

    return successCreateOrganizationResult(
      `Pagamento iniciado para o plano ${planName}. A organizacao sera criada somente apos aprovacao.`,
      checkout.checkoutUrl,
      "external",
      checkout.intentId,
    );
  } catch (error) {
    return errorCreateOrganizationResult(
      normalizeActionErrorMessage(error, "Falha ao criar nova organizacao."),
    );
  }
}
