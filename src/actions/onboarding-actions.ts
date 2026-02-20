"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { BillingPlanCode, SubscriptionStatus } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/lib/auth/server";
import { localizeAuthErrorMessage } from "@/lib/auth/error-messages";
import { profileUpdateSchema } from "@/lib/auth/schemas";
import { DEFAULT_TRIAL_DAYS, getPlanDefinition } from "@/lib/billing/plans";
import { prisma } from "@/lib/db/prisma";
import { buildOrganizationSlug } from "@/lib/organization/helpers";
import { getTenantContext } from "@/lib/organization/tenant-context";
import { detectImageMimeTypeBySignature } from "@/lib/uploads/image-signature";

const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const ORGANIZATION_LOGO_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_PROFILE_IMAGE_FOLDER = "saas-starter/profile";
const DEFAULT_ORGANIZATION_LOGO_FOLDER = "avocado-saas-starter/organization";
const ORGANIZATION_SLUG_MAX_LENGTH = 70;

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
): CreateOrganizationWithPlanActionResult {
  return {
    status: "success",
    message,
    redirectTo,
  };
}

function errorCreateOrganizationResult(message: string): CreateOrganizationWithPlanActionResult {
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

function generateOrganizationSlugVariant(baseSlug: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  const base = baseSlug
    .slice(0, Math.max(1, ORGANIZATION_SLUG_MAX_LENGTH - suffix.length - 1))
    .replace(/-+$/g, "");

  return `${base || "organizacao"}-${suffix}`.slice(0, ORGANIZATION_SLUG_MAX_LENGTH);
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

async function createOrganizationWithSlugFallback(
  requestHeaders: Headers,
  companyName: string,
  slug: string,
  logo: string | null,
  keepCurrentActiveOrganization: boolean = false,
): Promise<void> {
  try {
    await auth.api.createOrganization({
      headers: requestHeaders,
      body: {
        name: companyName,
        slug,
        keepCurrentActiveOrganization,
        ...(logo ? { logo } : {}),
      },
    });
    return;
  } catch (error) {
    const normalizedErrorMessage = parseActionError(error, "").trim().toLowerCase();
    const isSlugConflict =
      normalizedErrorMessage.includes("organization already exists") ||
      normalizedErrorMessage.includes("organization slug already taken") ||
      normalizedErrorMessage.includes("slug is taken");

    if (!isSlugConflict) {
      throw error;
    }

    const organizations = await auth.api
      .listOrganizations({
        headers: requestHeaders,
      })
      .catch(() => []);

    const existingOrganization = organizations.find((organization) => organization.slug === slug);
    if (existingOrganization) {
      if (!keepCurrentActiveOrganization) {
        await auth.api.setActiveOrganization({
          headers: requestHeaders,
          body: {
            organizationId: existingOrganization.id,
          },
        });
      }
      return;
    }

    await auth.api.createOrganization({
      headers: requestHeaders,
      body: {
        name: companyName,
        slug: generateOrganizationSlugVariant(slug),
        keepCurrentActiveOrganization,
        ...(logo ? { logo } : {}),
      },
    });
  }
}

function formatTrialEndsAt(value: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(value);
}

async function assertUserCanCreateFreeOrganization(ownerUserId: string): Promise<void> {
  const activeFreeTrial = await prisma.ownerSubscription.findFirst({
    where: {
      ownerUserId,
      status: SubscriptionStatus.TRIALING,
      planCode: BillingPlanCode.FREE,
      trialEndsAt: {
        gt: new Date(),
      },
    },
    orderBy: {
      trialEndsAt: "desc",
    },
    select: {
      trialEndsAt: true,
      organization: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!activeFreeTrial?.trialEndsAt) {
    return;
  }

  const activeOrganizationName = activeFreeTrial.organization.name.trim() || "organizacao ativa";
  throw new Error(
    `Cada usuario pode manter apenas 1 organizacao gratuita por ${DEFAULT_TRIAL_DAYS} dias. Voce ja possui ${activeOrganizationName} em periodo gratuito ate ${formatTrialEndsAt(activeFreeTrial.trialEndsAt)}.`,
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

    await createOrganizationWithSlugFallback(
      await headers(),
      parsed.data.companyName,
      slug,
      uploadedOrganizationLogoUrl,
    );

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

    if (parsed.data.planCode === BillingPlanCode.FREE) {
      await assertUserCanCreateFreeOrganization(userId);
    }

    const requestHeaders = await headers();
    const slug = buildOrganizationSlug(parsed.data.companyName, userEmail);

    await createOrganizationWithSlugFallback(
      requestHeaders,
      parsed.data.companyName,
      slug,
      null,
      parsed.data.keepCurrentActiveOrganization,
    );

    revalidateOnboardingPaths();
    revalidatePath("/billing");
    revalidatePath("/empresa/nova");

    if (parsed.data.planCode !== BillingPlanCode.FREE && !parsed.data.keepCurrentActiveOrganization) {
      const planName = getPlanDefinition(parsed.data.planCode).name;
      const params = new URLSearchParams({
        prefillPlan: parsed.data.planCode,
      });

      return successCreateOrganizationResult(
        `Organizacao criada. Finalize agora a contratacao do plano ${planName}.`,
        `/billing?${params.toString()}`,
      );
    }

    if (parsed.data.planCode !== BillingPlanCode.FREE) {
      const planName = getPlanDefinition(parsed.data.planCode).name;
      return successCreateOrganizationResult(
        `Organizacao criada. Para ativar o plano ${planName}, troque para ela e finalize no faturamento.`,
        parsed.data.redirectPath,
      );
    }

    return successCreateOrganizationResult("Organizacao vinculada com sucesso.", parsed.data.redirectPath);
  } catch (error) {
    return errorCreateOrganizationResult(
      normalizeActionErrorMessage(error, "Falha ao criar nova organizacao."),
    );
  }
}
