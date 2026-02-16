"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BillingPlanCode } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/lib/auth/server";
import {
  cancelOwnerSubscription,
  createPlanCheckoutSession,
  ensureOwnerSubscription,
  getOwnerEntitlements,
  reactivateOwnerSubscription,
  simulateOwnerCheckoutPayment,
  startOwnerTrial,
  syncOwnerInvoicesFromAbacate,
  updateOwnerBillingProfile,
} from "@/lib/billing/subscription-service";
import {
  type BillingCancellationReasonCode,
  isBillingCancellationReasonCode,
} from "@/lib/billing/cancellation";
import { isTrustedAbacateCheckoutUrl } from "@/lib/billing/abacatepay";
import { prisma } from "@/lib/db/prisma";
import { isOrganizationOwnerRole } from "@/lib/organization/helpers";
import { getTenantContext } from "@/lib/organization/tenant-context";

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

const billingProfileSchema = z.object({
  billingName: z.string().trim().min(2, "Informe o nome de faturamento."),
  billingCellphone: z
    .string()
    .trim()
    .transform(onlyDigits)
    .refine(isValidBrazilPhone, "Informe um telefone válido."),
  billingTaxId: z
    .string()
    .trim()
    .transform(onlyDigits)
    .refine(isValidCpfOrCnpj, "Informe um CPF ou CNPJ válido."),
});

const planSchema = z.object({
  planCode: z.nativeEnum(BillingPlanCode),
  billingCycle: z.enum(["MONTHLY", "ANNUAL"]).catch("MONTHLY"),
  forceCheckout: z
    .string()
    .trim()
    .optional()
    .transform((value) => value === "true"),
});

const trialSchema = z.object({
  trialPlanCode: z.nativeEnum(BillingPlanCode),
});

const cancelSubscriptionSchema = z
  .object({
  immediate: z
    .string()
    .trim()
    .optional()
      .transform((value) => value === "true"),
    cancellationReason: z
      .string()
      .trim()
      .refine(isBillingCancellationReasonCode, "Selecione um motivo valido para cancelar.")
      .transform((value) => value as BillingCancellationReasonCode),
    cancellationReasonNote: z
      .string()
      .trim()
      .max(500, "Informe no maximo 500 caracteres no detalhamento.")
      .optional()
      .transform((value) => value ?? ""),
    currentPassword: z
      .string()
      .min(1, "Informe sua senha atual para confirmar o cancelamento."),
  })
  .superRefine((values, ctx) => {
    if (values.cancellationReason === "OTHER" && values.cancellationReasonNote.length < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cancellationReasonNote"],
        message: "Descreva o motivo em pelo menos 5 caracteres quando selecionar 'Outro motivo'.",
      });
    }
  });

async function getAuthenticatedBillingContext(): Promise<{
  userId: string;
  organizationId: string;
}> {
  const tenantContext = await getTenantContext();
  if (!tenantContext.session?.user?.id) {
    redirect("/sign-in");
  }

  if (!tenantContext.organizationId || !isOrganizationOwnerRole(tenantContext.role)) {
    redirect("/dashboard");
  }

  return {
    userId: tenantContext.session.user.id,
    organizationId: tenantContext.organizationId,
  };
}

function redirectWithMessage(kind: "success" | "error", message: string): never {
  const params = new URLSearchParams();
  params.set(kind, message);
  redirect(`/billing?${params.toString()}`);
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

function isNextRedirectError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) {
    return false;
  }

  const { digest } = error as { digest?: unknown };
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

async function applyBillingPayloadFromFormData(input: {
  organizationId: string;
  formData: FormData;
  checkoutErrorMessage: string;
}): Promise<void> {
  const rawBillingName = String(input.formData.get("billingName") ?? "").trim();
  const rawBillingCellphone = String(input.formData.get("billingCellphone") ?? "").trim();
  const rawBillingTaxId = String(input.formData.get("billingTaxId") ?? "").trim();
  const hasBillingPayload = Boolean(rawBillingName || rawBillingCellphone || rawBillingTaxId);

  if (!hasBillingPayload) {
    return;
  }

  const parsedBillingProfile = billingProfileSchema.safeParse({
    billingName: rawBillingName,
    billingCellphone: rawBillingCellphone,
    billingTaxId: rawBillingTaxId,
  });

  if (!parsedBillingProfile.success) {
    redirectWithMessage(
      "error",
      parsedBillingProfile.error.issues[0]?.message ?? "Dados de faturamento inválidos.",
    );
  }

  try {
    await updateOwnerBillingProfile(input.organizationId, parsedBillingProfile.data);
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithMessage("error", parseActionError(error, input.checkoutErrorMessage));
  }
}

export async function saveBillingProfileAction(formData: FormData): Promise<void> {
  const { organizationId } = await getAuthenticatedBillingContext();

  const parsed = billingProfileSchema.safeParse({
    billingName: String(formData.get("billingName") ?? ""),
    billingCellphone: String(formData.get("billingCellphone") ?? ""),
    billingTaxId: String(formData.get("billingTaxId") ?? ""),
  });

  if (!parsed.success) {
    redirectWithMessage("error", parsed.error.issues[0]?.message ?? "Dados de faturamento inválidos.");
  }

  try {
    await updateOwnerBillingProfile(organizationId, parsed.data);
    revalidatePath("/billing");
    redirectWithMessage("success", "Dados de faturamento atualizados com sucesso.");
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithMessage("error", parseActionError(error, "Falha ao salvar dados de faturamento."));
  }
}

export async function createPlanCheckoutAction(formData: FormData): Promise<void> {
  const { organizationId } = await getAuthenticatedBillingContext();

  const parsed = planSchema.safeParse({
    planCode: String(formData.get("planCode") ?? ""),
    billingCycle: String(formData.get("billingCycle") ?? ""),
    forceCheckout: String(formData.get("forceCheckout") ?? ""),
  });

  if (!parsed.success) {
    redirectWithMessage("error", parsed.error.issues[0]?.message ?? "Plano inválido.");
  }

  await applyBillingPayloadFromFormData({
    organizationId,
    formData,
    checkoutErrorMessage: "Falha ao salvar dados de faturamento para checkout.",
  });

  try {
    if (parsed.data.planCode === BillingPlanCode.FREE) {
      const entitlements = await getOwnerEntitlements(organizationId);

      if (entitlements.effectivePlanCode === BillingPlanCode.FREE) {
        revalidatePath("/billing");
        redirectWithMessage("success", "Sua conta já está no plano Free.");
      }

      await cancelOwnerSubscription(organizationId, false);
      revalidatePath("/billing");
      redirectWithMessage("success", "Downgrade para Free agendado para o fim do período.");
    }

    const result = await createPlanCheckoutSession({
      organizationId,
      targetPlanCode: parsed.data.planCode,
      billingCycle: parsed.data.billingCycle,
      allowSamePlan: parsed.data.forceCheckout,
    });

    if (!isTrustedAbacateCheckoutUrl(result.checkoutUrl)) {
      throw new Error("URL de checkout inválida retornada pelo provedor.");
    }

    revalidatePath("/billing");
    redirect(result.checkoutUrl);
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithMessage("error", parseActionError(error, "Falha ao gerar checkout do plano."));
  }
}

export async function startTrialAction(formData: FormData): Promise<void> {
  const { organizationId } = await getAuthenticatedBillingContext();

  const parsed = trialSchema.safeParse({
    trialPlanCode: String(formData.get("trialPlanCode") ?? ""),
  });

  if (!parsed.success) {
    redirectWithMessage("error", parsed.error.issues[0]?.message ?? "Plano de trial inválido.");
  }

  try {
    await startOwnerTrial(organizationId, parsed.data.trialPlanCode);
    revalidatePath("/billing");
    redirectWithMessage("success", "Trial ativado com sucesso.");
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithMessage("error", parseActionError(error, "Não foi possível ativar trial."));
  }
}

export async function cancelSubscriptionAction(formData: FormData): Promise<void> {
  const { userId, organizationId } = await getAuthenticatedBillingContext();

  const parsed = cancelSubscriptionSchema.safeParse({
    immediate: String(formData.get("immediate") ?? ""),
    cancellationReason: String(formData.get("cancellationReason") ?? ""),
    cancellationReasonNote: String(formData.get("cancellationReasonNote") ?? ""),
    currentPassword: String(formData.get("currentPassword") ?? ""),
  });

  if (!parsed.success) {
    redirectWithMessage("error", parsed.error.issues[0]?.message ?? "Dados invalidos para cancelamento.");
  }

  const credentialAccount = await prisma.account.findFirst({
    where: {
      userId,
      providerId: "credential",
    },
    select: {
      password: true,
    },
  });

  if (!credentialAccount?.password) {
    redirectWithMessage(
      "error",
      "Sua conta nao possui senha ativa. Defina uma senha no Perfil para cancelar a assinatura.",
    );
  }

  const authContext = await auth.$context;
  const passwordMatches = await authContext.password.verify({
    hash: credentialAccount.password,
    password: parsed.data.currentPassword,
  });

  if (!passwordMatches) {
    redirectWithMessage("error", "Senha atual incorreta. Cancelamento nao efetuado.");
  }

  try {
    const subscription = await ensureOwnerSubscription(organizationId);
    await cancelOwnerSubscription(organizationId, parsed.data.immediate);
    let feedbackSaved = true;

    try {
      await prisma.subscriptionCancellationFeedback.create({
        data: {
          ownerUserId: subscription.ownerUserId,
          subscriptionId: subscription.id,
          immediate: parsed.data.immediate,
          reasonCode: parsed.data.cancellationReason,
          reasonDetail:
            parsed.data.cancellationReasonNote.length > 0 ? parsed.data.cancellationReasonNote : null,
        },
      });
    } catch (feedbackError) {
      feedbackSaved = false;
      console.error("Falha ao registrar motivo de cancelamento.", feedbackError);
    }

    const successMessage = parsed.data.immediate
      ? "Assinatura cancelada imediatamente."
      : "Assinatura marcada para cancelamento no fim do período.";

    revalidatePath("/billing");
    redirectWithMessage(
      "success",
      feedbackSaved
        ? successMessage
        : `${successMessage} Motivo nao foi registrado por falha tecnica.`,
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithMessage("error", parseActionError(error, "Falha ao cancelar assinatura."));
  }
}

export async function reactivateSubscriptionAction(): Promise<void> {
  const { organizationId } = await getAuthenticatedBillingContext();

  try {
    await reactivateOwnerSubscription(organizationId);
    revalidatePath("/billing");
    redirectWithMessage("success", "Assinatura reativada com sucesso.");
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithMessage("error", parseActionError(error, "Falha ao reativar assinatura."));
  }
}

export async function simulateCheckoutPaymentAction(formData: FormData): Promise<void> {
  const { organizationId } = await getAuthenticatedBillingContext();
  const checkoutId = String(formData.get("checkoutId") ?? "").trim();

  try {
    if (checkoutId) {
      await simulateOwnerCheckoutPayment({
        organizationId,
        checkoutId,
      });
      revalidatePath("/billing");
      redirectWithMessage("success", "Simulacao de pagamento enviada com sucesso.");
    }

    const parsedPlan = planSchema.safeParse({
      planCode: String(formData.get("planCode") ?? ""),
      billingCycle: String(formData.get("billingCycle") ?? ""),
      forceCheckout: String(formData.get("forceCheckout") ?? ""),
    });

    if (!parsedPlan.success) {
      redirectWithMessage("error", parsedPlan.error.issues[0]?.message ?? "Plano invalido.");
    }

    await applyBillingPayloadFromFormData({
      organizationId,
      formData,
      checkoutErrorMessage: "Falha ao salvar dados de faturamento para simular checkout.",
    });

    const checkoutResult = await createPlanCheckoutSession({
      organizationId,
      targetPlanCode: parsedPlan.data.planCode,
      billingCycle: parsedPlan.data.billingCycle,
      allowSamePlan: parsedPlan.data.forceCheckout,
    });

    await simulateOwnerCheckoutPayment({
      organizationId,
      checkoutId: checkoutResult.checkoutId,
    });

    revalidatePath("/billing");
    redirectWithMessage("success", "Pagamento simulado com sucesso.");
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithMessage("error", parseActionError(error, "Falha ao simular pagamento."));
  }
}

export async function syncInvoicesAction(): Promise<void> {
  const { organizationId } = await getAuthenticatedBillingContext();

  try {
    await syncOwnerInvoicesFromAbacate(organizationId);
    revalidatePath("/billing");
    redirectWithMessage("success", "Faturas sincronizadas com sucesso.");
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    redirectWithMessage("error", parseActionError(error, "Falha ao sincronizar faturas."));
  }
}
