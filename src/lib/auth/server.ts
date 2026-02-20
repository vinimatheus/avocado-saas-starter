import { isIP } from "node:net";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { jwt, organization, twoFactor } from "better-auth/plugins";
import { PlatformEventSeverity, Prisma, WebhookProcessingStatus } from "@prisma/client";
import { APIError } from "better-call";

import {
  assertOrganizationCanAddMember,
  assertOrganizationCanAcceptInvitation,
  assertOrganizationCanCreateInvitation,
  assertOwnerCanCreateOrganization,
  ensureOwnerSubscription,
  getOwnerEntitlements,
} from "@/lib/billing/subscription-service";
import { getPlanDefinition } from "@/lib/billing/plans";
import { prisma } from "@/lib/db/prisma";
import {
  DEFAULT_APP_BASE_URL,
  resolveExplicitAppBaseUrlFromEnv,
  resolveVercelAppBaseUrlFromEnv,
} from "@/lib/env/app-base-url";
import { hasOrganizationRole } from "@/lib/organization/helpers";
import { logPlatformEvent } from "@/lib/platform/events";

const INVITATION_ACCEPT_PATH = "/convites/aceitar";
const SIGN_IN_EMAIL_PATH = "/sign-in/email";
const SIGN_IN_SOCIAL_PATH = "/sign-in/social";
const TWO_FACTOR_VERIFY_TOTP_PATH = "/two-factor/verify-totp";
const TWO_FACTOR_VERIFY_OTP_PATH = "/two-factor/verify-otp";
const TWO_FACTOR_VERIFY_BACKUP_CODE_PATH = "/two-factor/verify-backup-code";
const OAUTH_CALLBACK_ROUTE_PATH = "/callback/:id";
const OAUTH_CALLBACK_PATH_PREFIX = "/callback/";
const DEFAULT_APP_NAME = "avocado SaaS";
const DEFAULT_AUTH_COOKIE_PREFIX = "avocado-starter-auth";
const RESEND_TIMEOUT_MS = 10_000;
const USAGE_ALERT_THRESHOLDS = [80, 100] as const;
const LOGIN_SESSION_ALERT_PATHS = new Set([
  SIGN_IN_EMAIL_PATH,
  SIGN_IN_SOCIAL_PATH,
  OAUTH_CALLBACK_ROUTE_PATH,
  TWO_FACTOR_VERIFY_TOTP_PATH,
  TWO_FACTOR_VERIFY_OTP_PATH,
  TWO_FACTOR_VERIFY_BACKUP_CODE_PATH,
]);

type GoogleSocialProviderConfig = {
  clientId: string;
  clientSecret: string;
};

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function getPrimaryAppBaseUrl(): string {
  const explicitBaseUrl = resolveExplicitAppBaseUrlFromEnv();
  if (explicitBaseUrl.hasConfiguredValue) {
    if (explicitBaseUrl.origin) {
      return explicitBaseUrl.origin;
    }

    if (isProduction()) {
      throw new Error("BETTER_AUTH_URL inválida. Configure uma URL absoluta válida.");
    }
  }

  const vercelBaseUrl = resolveVercelAppBaseUrlFromEnv();
  if (vercelBaseUrl) {
    return vercelBaseUrl;
  }

  if (isProduction()) {
    throw new Error(
      "BETTER_AUTH_URL é obrigatória em produção fora da Vercel. Na Vercel, habilite as variáveis de ambiente do sistema.",
    );
  }

  return DEFAULT_APP_BASE_URL;
}

function getTrustedOrigins(): string[] {
  const configured = process.env.TRUSTED_ORIGINS?.trim() || "";
  const parsed = configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      try {
        return Boolean(new URL(value).origin);
      } catch {
        return false;
      }
    });

  const baseUrl = getPrimaryAppBaseUrl();
  return Array.from(new Set([baseUrl, ...parsed]));
}

function getGoogleSocialProviderConfig(): GoogleSocialProviderConfig | undefined {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";

  if (!clientId && !clientSecret) {
    return undefined;
  }

  if (!clientId || !clientSecret) {
    throw new Error(
      "Para habilitar login com Google, configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.",
    );
  }

  return {
    clientId,
    clientSecret,
  };
}

function getAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim() || "";

  if (!secret) {
    if (isProduction()) {
      throw new Error("BETTER_AUTH_SECRET é obrigatória em produção.");
    }
    return "dev-only-better-auth-secret-change-me";
  }

  if (isProduction() && secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET deve ter pelo menos 32 caracteres em produção.");
  }

  return secret;
}

function getAuthCookiePrefix(): string {
  const configuredPrefix = process.env.BETTER_AUTH_COOKIE_PREFIX?.trim() || "";
  return configuredPrefix || DEFAULT_AUTH_COOKIE_PREFIX;
}

function getTwoFactorIssuer(): string {
  const configuredIssuer = process.env.BETTER_AUTH_2FA_ISSUER?.trim();
  if (configuredIssuer) {
    return configuredIssuer;
  }

  return getAppName();
}

function getAppName(): string {
  const configuredAppName = process.env.NEXT_PUBLIC_APP_NAME?.trim();
  if (configuredAppName) {
    return configuredAppName;
  }

  return DEFAULT_APP_NAME;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function resolveAppBaseUrl(request?: Request): string {
  try {
    return getPrimaryAppBaseUrl();
  } catch {
    // Fall back only during development.
  }

  if (!isProduction() && request) {
    try {
      return new URL(request.url).origin;
    } catch {
      // Ignore invalid request URLs and use localhost below.
    }
  }

  return DEFAULT_APP_BASE_URL;
}

function toRoleLabel(role: string): string {
  if (role === "owner") {
    return "Proprietario";
  }

  if (role === "admin") {
    return "Administrador";
  }

  return "Usuario";
}

function toMembershipRoleLabel(role: string | null | undefined): string {
  if (hasOrganizationRole(role, "owner")) {
    return "Proprietario";
  }

  if (hasOrganizationRole(role, "admin")) {
    return "Administrador";
  }

  return "Usuario";
}

function formatMoneyForEmail(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency || "BRL",
    minimumFractionDigits: 2,
  }).format(amountCents / 100);
}

function toUsageMetricLabel(metric: UsageAlertMetric): string {
  if (metric === "users") {
    return "usuarios";
  }

  if (metric === "projects") {
    return "projetos";
  }

  return "consumo mensal";
}

function toErrorMessage(error: unknown, fallbackMessage: string): string {
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

function shouldSendWelcomeEmailForUserCreate(path: string): boolean {
  return (
    path === SIGN_IN_SOCIAL_PATH ||
    path === OAUTH_CALLBACK_ROUTE_PATH ||
    path.startsWith(OAUTH_CALLBACK_PATH_PREFIX)
  );
}

function shouldSendSuspiciousLoginEmailForSessionCreate(path: string): boolean {
  return path.startsWith(OAUTH_CALLBACK_PATH_PREFIX) || LOGIN_SESSION_ALERT_PATHS.has(path);
}

function normalizeSessionUserAgent(userAgent: string | null | undefined): string | null {
  const value = typeof userAgent === "string" ? userAgent.trim().toLowerCase() : "";
  if (!value) {
    return null;
  }

  return value
    .replaceAll(/\/[\d._]+/g, "/#")
    .replaceAll(/\b\d+(?:\.\d+)*\b/g, "#")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function normalizeSessionIpAddress(ipAddress: string | null | undefined): string | null {
  if (typeof ipAddress !== "string") {
    return null;
  }

  const firstValue = ipAddress
    .split(",")
    .map((value) => value.trim())
    .find(Boolean);
  if (!firstValue) {
    return null;
  }

  const bracketMatch = firstValue.match(/^\[([^\]]+)\](?::\d+)?$/);
  const ipCandidateWithPort = bracketMatch?.[1] ?? firstValue;
  const mappedIpv4Match = ipCandidateWithPort.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  const mappedOrRawIp = mappedIpv4Match?.[1] ?? ipCandidateWithPort;
  const ipv4WithPortMatch = mappedOrRawIp.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  const normalizedIp = ipv4WithPortMatch?.[1] ?? mappedOrRawIp;

  return isIP(normalizedIp) ? normalizedIp : null;
}

function toSessionNetworkFingerprint(ipAddress: string | null | undefined): string | null {
  const normalizedIp = normalizeSessionIpAddress(ipAddress);
  if (!normalizedIp) {
    return null;
  }

  if (isIP(normalizedIp) === 4) {
    const octets = normalizedIp.split(".");
    if (octets.length === 4) {
      return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
    }
  }

  if (isIP(normalizedIp) === 6) {
    const segments = normalizedIp.split(":").filter((segment) => segment.length > 0);
    if (segments.length >= 4) {
      return `${segments.slice(0, 4).join(":")}::/64`;
    }
  }

  return normalizedIp;
}

async function dedupeCredentialAccountsForEmail(rawEmail: unknown): Promise<void> {
  if (typeof rawEmail !== "string") {
    return;
  }

  const email = rawEmail.trim().toLowerCase();
  if (!email) {
    return;
  }

  const user = await prisma.user.findUnique({
    where: {
      email,
    },
    select: {
      id: true,
    },
  });

  if (!user) {
    return;
  }

  const credentialAccounts = await prisma.account.findMany({
    where: {
      userId: user.id,
      providerId: "credential",
    },
    orderBy: [
      {
        updatedAt: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
    select: {
      id: true,
      password: true,
    },
  });

  if (credentialAccounts.length <= 1) {
    return;
  }

  const accountWithPassword = credentialAccounts.find((account) => Boolean(account.password));
  const primaryAccount = accountWithPassword ?? credentialAccounts[0];
  if (!primaryAccount) {
    return;
  }

  const staleAccountIds = credentialAccounts
    .filter((account) => account.id !== primaryAccount.id)
    .map((account) => account.id);

  if (staleAccountIds.length === 0) {
    return;
  }

  await prisma.account.deleteMany({
    where: {
      id: {
        in: staleAccountIds,
      },
      userId: user.id,
      providerId: "credential",
    },
  });
}

async function resolvePlatformUserByEmail(rawEmail: unknown): Promise<{
  id: string;
  platformStatus: "ACTIVE" | "BLOCKED";
  platformBlockedReason: string | null;
} | null> {
  if (typeof rawEmail !== "string") {
    return null;
  }

  const normalizedEmail = rawEmail.trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  return prisma.user.findUnique({
    where: {
      email: normalizedEmail,
    },
    select: {
      id: true,
      platformStatus: true,
      platformBlockedReason: true,
    },
  });
}

async function assertEmailUserNotPlatformBlocked(rawEmail: unknown, path: string): Promise<void> {
  const user = await resolvePlatformUserByEmail(rawEmail);
  if (!user || user.platformStatus !== "BLOCKED") {
    return;
  }

  await logPlatformEvent({
    source: "auth",
    action: "login.blocked",
    severity: PlatformEventSeverity.WARN,
    actorUserId: user.id,
    targetType: "user",
    targetId: user.id,
    metadata: {
      path,
      reason: user.platformBlockedReason ?? null,
      channel: "pre-sign-in",
    },
  });

  throw new APIError("FORBIDDEN", {
    message: "Conta bloqueada pela administracao da plataforma.",
  });
}

type OrganizationInvitationEmailPayload = {
  id: string;
  role: string;
  email: string;
  organization: {
    name: string;
  };
  inviter: {
    user: {
      name?: string | null;
      email: string;
    };
  };
};

type VerificationEmailPayload = {
  user: {
    name?: string | null;
    email: string;
  };
  url: string;
};

type ResetPasswordEmailPayload = {
  user: {
    name?: string | null;
    email: string;
  };
  url: string;
};

type WelcomeEmailPayload = {
  user: {
    id: string;
    name?: string | null;
    email: string;
  };
};

type MemberRemovedFromOrganizationEmailPayload = {
  recipientEmail: string;
  recipientName?: string | null;
  organizationName: string;
  removedByName?: string | null;
  request?: Request;
};

type OrganizationDeletedEmailPayload = {
  recipientEmail: string;
  recipientName?: string | null;
  organizationName: string;
  deletedByName?: string | null;
  request?: Request;
};

type SubscriptionEndingSoonEmailPayload = {
  recipientEmail: string;
  recipientName?: string | null;
  organizationName: string;
  planName: string;
  periodEndsAt: Date;
  request?: Request;
};

type SubscriptionCanceledEmailPayload = {
  recipientEmail: string;
  recipientName?: string | null;
  organizationName: string;
  planName: string;
  canceledAt: Date;
  request?: Request;
};

type EmailChangeNotificationPayload = {
  currentEmail: string;
  newEmail: string;
  recipientName?: string | null;
  request?: Request;
};

type InvitationAcceptedEmailPayload = {
  inviterEmail: string;
  inviterName?: string | null;
  acceptedUserEmail: string;
  acceptedUserName?: string | null;
  organizationName: string;
  request?: Request;
};

type MemberRoleChangedEmailPayload = {
  recipientEmail: string;
  recipientName?: string | null;
  organizationName: string;
  previousRole: string;
  newRole: string;
  changedByName?: string | null;
  request?: Request;
};

type OwnershipTransferredEmailPayload = {
  recipientEmail: string;
  recipientName?: string | null;
  organizationName: string;
  transferType: "received" | "transferred";
  counterpartName?: string | null;
  request?: Request;
};

type PasswordChangedEmailPayload = {
  recipientEmail: string;
  recipientName?: string | null;
  request?: Request;
};

type TwoFactorChangedEmailPayload = {
  recipientEmail: string;
  recipientName?: string | null;
  enabled: boolean;
  request?: Request;
};

type SuspiciousLoginEmailPayload = {
  recipientEmail: string;
  recipientName?: string | null;
  loggedInAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  isNewDevice: boolean;
  isNewLocation: boolean;
  request?: Request;
};

type PaymentApprovedEmailPayload = {
  recipientEmail: string;
  recipientName?: string | null;
  organizationName: string;
  planName: string;
  amountCents: number;
  currency: string;
  paidAt: Date;
  receiptUrl?: string | null;
  billingUrl?: string | null;
  request?: Request;
};

type PaymentFailedDunningEmailPayload = {
  recipientEmail: string;
  recipientName?: string | null;
  organizationName: string;
  planName: string;
  dunningDay: number;
  graceEndsAt: Date | null;
  billingUrl?: string | null;
  request?: Request;
};

type UsageAlertMetric = "users" | "projects" | "monthly_usage";

type PlanUsageThresholdEmailPayload = {
  recipientEmail: string;
  recipientName?: string | null;
  organizationName: string;
  planName: string;
  metric: UsageAlertMetric;
  threshold: 80 | 100;
  current: number;
  maxAllowed: number;
  request?: Request;
};

type TransactionalEmailPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

async function sendTransactionalEmail(payload: TransactionalEmailPayload): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFromEmail = process.env.RESEND_FROM_EMAIL;

  if (!resendApiKey || !resendFromEmail) {
    console.warn(
      "Transactional email skipped: configure RESEND_API_KEY and RESEND_FROM_EMAIL.",
    );
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFromEmail,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
    signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
  });

  if (response.ok) {
    return;
  }

  const responseText = await response.text().catch(() => "");
  console.error("Failed to send transactional email with Resend.", response.status, responseText);
}

type BrandedEmailTemplatePayload = {
  request?: Request;
  subject: string;
  title: string;
  messageHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  footerHtml: string;
};

const HTTP_PROTOCOL_REGEX = /^https?:\/\//i;

function resolveEmailAssetBaseUrl(request?: Request): string {
  const configuredAssetBaseUrl = process.env.EMAIL_ASSET_BASE_URL?.trim() ?? "";
  if (configuredAssetBaseUrl) {
    const normalizedAssetBaseUrl = HTTP_PROTOCOL_REGEX.test(configuredAssetBaseUrl)
      ? configuredAssetBaseUrl
      : `https://${configuredAssetBaseUrl}`;

    try {
      return new URL(normalizedAssetBaseUrl).origin;
    } catch {
      console.warn(
        "EMAIL_ASSET_BASE_URL invalida. Use uma URL absoluta valida (ex.: https://app.seudominio.com).",
      );
    }
  }

  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "";
  if (configuredSiteUrl) {
    const normalizedSiteUrl = HTTP_PROTOCOL_REGEX.test(configuredSiteUrl)
      ? configuredSiteUrl
      : `https://${configuredSiteUrl}`;

    try {
      return new URL(normalizedSiteUrl).origin;
    } catch {
      console.warn(
        "NEXT_PUBLIC_SITE_URL invalida. Use uma URL absoluta valida (ex.: https://app.seudominio.com).",
      );
    }
  }

  return resolveAppBaseUrl(request);
}

function getBrandedEmailAssetUrl(assetPath: string, request?: Request): string {
  return new URL(assetPath, resolveEmailAssetBaseUrl(request)).toString();
}

function renderBrandedEmailHtml(payload: BrandedEmailTemplatePayload): string {
  const appName = escapeHtml(getAppName());
  const escapedSubject = escapeHtml(payload.subject);
  const escapedTitle = escapeHtml(payload.title);
  const escapedCtaLabel = escapeHtml(payload.ctaLabel);
  const escapedCtaUrl = escapeHtml(payload.ctaUrl);
  const escapedLogoUrl = escapeHtml(getBrandedEmailAssetUrl("/img/logo.png", payload.request));
  const escapedHeroUrl = escapeHtml(getBrandedEmailAssetUrl("/img/email.png", payload.request));

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedSubject}</title>
</head>
<body style="margin: 0; padding: 0; background: #f7f7f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <span style="display: none; opacity: 0; visibility: hidden; mso-hide: all; overflow: hidden; font-size: 1px; line-height: 1px; max-height: 0; max-width: 0;">
    ${escapedSubject}
  </span>
  <div style="padding: 32px 14px;">
    <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #e3e3de; border-radius: 20px; overflow: hidden; box-shadow: 0 18px 45px -28px rgba(24, 47, 24, 0.35);">
      <div style="padding: 24px 24px 0; background: linear-gradient(145deg, #4caf50 0%, #8dcf90 52%, #a5d6a7 100%);">
        <img src="${escapedLogoUrl}" alt="${appName}" width="52" height="52" style="display: block; width: 52px; height: 52px; object-fit: contain; background: rgba(255, 255, 255, 0.94); border-radius: 12px; padding: 8px;">
        <div style="margin-top: 18px;">
          <img src="${escapedHeroUrl}" alt="Ilustração do avocado SaaS" width="572" style="display: block; width: 100%; max-width: 572px; height: auto; border-radius: 14px 14px 0 0; border: 1px solid rgba(255, 255, 255, 0.5); border-bottom: 0;">
        </div>
      </div>

      <div style="padding: 34px 30px 24px;">
        <h1 style="margin: 0 0 14px; color: #2f4430; font-size: 27px; line-height: 1.2; letter-spacing: -0.02em;">
          ${escapedTitle}
        </h1>
        <p style="margin: 0; color: #3b2f2f; font-size: 16px; line-height: 1.65;">
          ${payload.messageHtml}
        </p>

        <div style="text-align: center; margin: 30px 0 10px;">
          <a href="${escapedCtaUrl}" style="display: inline-block; background: #4caf50; color: #f7f7f5; padding: 14px 34px; border-radius: 999px; font-weight: 700; font-size: 15px; text-decoration: none; box-shadow: 0 9px 25px -14px rgba(76, 175, 80, 0.85);">
            ${escapedCtaLabel}
          </a>
        </div>

        <p style="margin: 0; color: #6b6360; font-size: 13px; line-height: 1.6; text-align: center;">
          Se o botão não funcionar, abra este link no navegador:<br>
          <a href="${escapedCtaUrl}" style="color: #4caf50; text-decoration: underline; word-break: break-all;">${escapedCtaUrl}</a>
        </p>
      </div>

      <div style="padding: 18px 30px 24px; border-top: 1px solid #e3e3de; background: #f1f7f1;">
        <p style="margin: 0; color: #6b6360; font-size: 12px; line-height: 1.55;">
          ${payload.footerHtml}
        </p>
        <p style="margin: 8px 0 0; color: #8a6f5d; font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase;">
          ${appName}
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function formatDateTimeForEmail(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

function toRecipientName(name: string | null | undefined, email: string): string {
  return name?.trim() || email;
}

function usageThresholdReached(
  current: number,
  maxAllowed: number,
): 80 | 100 | null {
  if (maxAllowed <= 0) {
    return null;
  }

  if (current >= maxAllowed) {
    return 100;
  }

  if (current >= Math.ceil(maxAllowed * 0.8)) {
    return 80;
  }

  return null;
}

function currentYearMonthToken(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

async function acquireInternalNotificationMarker(
  id: string,
  eventType: string,
  payload: Prisma.InputJsonValue,
): Promise<boolean> {
  try {
    await prisma.billingWebhookEvent.create({
      data: {
        id,
        provider: "internal",
        eventType,
        status: WebhookProcessingStatus.PROCESSED,
        payload,
        processedAt: new Date(),
      },
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("p2002") || message.includes("unique constraint")) {
      return false;
    }

    throw error;
  }
}

async function sendOrganizationInvitationEmail(
  payload: OrganizationInvitationEmailPayload,
  request?: Request,
): Promise<void> {
  const baseUrl = resolveAppBaseUrl(request);
  const invitationUrl = new URL(
    `${INVITATION_ACCEPT_PATH}?id=${encodeURIComponent(payload.id)}&email=${encodeURIComponent(payload.email)}`,
    baseUrl,
  ).toString();

  const inviterName = payload.inviter.user.name?.trim() || payload.inviter.user.email;
  const roleLabel = toRoleLabel(payload.role);
  const escapedOrgName = escapeHtml(payload.organization.name);
  const escapedInviterName = escapeHtml(inviterName);
  const escapedRoleLabel = escapeHtml(roleLabel);

  const subject = `Convite para ${payload.organization.name}`;
  const text = `${inviterName} convidou você para fazer parte da equipe de ${payload.organization.name} com o cargo de ${roleLabel}.\n\nAceite o convite em: ${invitationUrl}\n\nSe você não esperava este convite, ignore este e-mail.`;
  const html = renderBrandedEmailHtml({
    request,
    subject,
    title: `Convite para ${payload.organization.name}`,
    messageHtml: `Olá! <strong>${escapedInviterName}</strong> convidou você para fazer parte da equipe <strong>${escapedOrgName}</strong> como <strong>${escapedRoleLabel}</strong>.`,
    ctaLabel: "Aceitar convite",
    ctaUrl: invitationUrl,
    footerHtml: "Se você não esperava por este convite, pode ignorar este e-mail com tranquilidade.",
  });

  await sendTransactionalEmail({
    to: payload.email,
    subject,
    text,
    html,
  });
}

async function sendAccountVerificationEmail(payload: VerificationEmailPayload): Promise<void> {
  const recipientName = payload.user.name?.trim() || payload.user.email;
  const escapedRecipientName = escapeHtml(recipientName);

  const subject = "Confirme seu e-mail";
  const text = `${recipientName}, confirme seu e-mail para liberar o acesso ao sistema.\n\nConfirme aqui: ${payload.url}\n\nSe você não criou essa conta, ignore este e-mail.`;
  const html = renderBrandedEmailHtml({
    subject,
    title: "Confirme seu e-mail",
    messageHtml: `Olá, <strong>${escapedRecipientName}</strong>. Para concluir seu cadastro e liberar o acesso, confirme seu e-mail.`,
    ctaLabel: "Verificar e-mail",
    ctaUrl: payload.url,
    footerHtml: "Se você não reconhece esta ação, pode ignorar este e-mail com segurança.",
  });

  await sendTransactionalEmail({
    to: payload.user.email,
    subject,
    text,
    html,
  });
}

async function sendResetPasswordEmail(payload: ResetPasswordEmailPayload): Promise<void> {
  const recipientName = payload.user.name?.trim() || payload.user.email;
  const escapedRecipientName = escapeHtml(recipientName);

  const subject = "Redefinição de senha";
  const text = `${recipientName}, recebemos uma solicitação para redefinir sua senha.\n\nClique aqui para redefinir: ${payload.url}\n\nSe você não solicitou, ignore este e-mail.`;
  const html = renderBrandedEmailHtml({
    subject,
    title: "Redefinição de senha",
    messageHtml: `Olá, <strong>${escapedRecipientName}</strong>. Recebemos uma solicitação para redefinir a senha da sua conta.`,
    ctaLabel: "Redefinir senha",
    ctaUrl: payload.url,
    footerHtml: "Se você não solicitou essa alteração, ignore este e-mail e mantenha sua conta segura.",
  });

  await sendTransactionalEmail({
    to: payload.user.email,
    subject,
    text,
    html,
  });
}

async function sendSignUpThankYouEmail(payload: WelcomeEmailPayload, request?: Request): Promise<void> {
  const appName = getAppName();
  const recipientName = payload.user.name?.trim() || payload.user.email;
  const escapedRecipientName = escapeHtml(recipientName);
  const escapedAppName = escapeHtml(appName);
  const onboardingUrl = new URL("/onboarding/company", resolveAppBaseUrl(request)).toString();

  const subject = `Cadastro confirmado no ${appName}`;
  const text = `${recipientName}, seu cadastro no ${appName} foi concluido com sucesso.\n\nAgora e so acessar sua conta e concluir a configuracao inicial: ${onboardingUrl}\n\nObrigado por escolher o ${appName}.`;
  const html = renderBrandedEmailHtml({
    request,
    subject,
    title: "Cadastro confirmado",
    messageHtml: `Ola, <strong>${escapedRecipientName}</strong>. Obrigado por se cadastrar no <strong>${escapedAppName}</strong>. Sua conta ja esta pronta para voce comecar.`,
    ctaLabel: "Acessar minha conta",
    ctaUrl: onboardingUrl,
    footerHtml: `Precisa de ajuda para dar os primeiros passos? Responda este e-mail e o time do ${escapedAppName} ajuda voce.`,
  });

  await sendTransactionalEmail({
    to: payload.user.email,
    subject,
    text,
    html,
  });
}

async function maybeSendSignUpThankYouEmail(
  payload: WelcomeEmailPayload,
  request?: Request,
): Promise<void> {
  const userId = payload.user.id.trim();
  if (!userId) {
    return;
  }

  const markerId = ["welcome_email", userId].join(":");
  const markerCreated = await acquireInternalNotificationMarker(markerId, "auth.welcome_email", {
    userId,
    email: payload.user.email,
  });
  if (!markerCreated) {
    return;
  }

  await sendSignUpThankYouEmail(payload, request);
}

export async function sendMemberRemovedFromOrganizationEmail(
  payload: MemberRemovedFromOrganizationEmailPayload,
): Promise<void> {
  const recipientName = toRecipientName(payload.recipientName, payload.recipientEmail);
  const removedByName = payload.removedByName?.trim() || "um administrador";
  const signInUrl = new URL("/sign-in", resolveAppBaseUrl(payload.request)).toString();
  const escapedRecipientName = escapeHtml(recipientName);
  const escapedOrganizationName = escapeHtml(payload.organizationName);
  const escapedRemovedByName = escapeHtml(removedByName);

  const subject = `Voce foi removido da organizacao ${payload.organizationName}`;
  const text =
    `${recipientName}, seu acesso a organizacao ${payload.organizationName} foi removido por ${removedByName}.` +
    `\n\nSe acredita que isso foi um engano, entre em contato com o owner da organizacao.` +
    `\n\nAcessar conta: ${signInUrl}`;
  const html = renderBrandedEmailHtml({
    request: payload.request,
    subject,
    title: "Acesso removido da organizacao",
    messageHtml: `Ola, <strong>${escapedRecipientName}</strong>. Seu acesso a organizacao <strong>${escapedOrganizationName}</strong> foi removido por <strong>${escapedRemovedByName}</strong>.`,
    ctaLabel: "Acessar minha conta",
    ctaUrl: signInUrl,
    footerHtml: "Se voce acha que isso foi um erro, fale com o owner ou administrador responsavel.",
  });

  await sendTransactionalEmail({
    to: payload.recipientEmail,
    subject,
    text,
    html,
  });
}

export async function sendOrganizationDeletedEmail(
  payload: OrganizationDeletedEmailPayload,
): Promise<void> {
  const recipientName = toRecipientName(payload.recipientName, payload.recipientEmail);
  const deletedByName = payload.deletedByName?.trim() || "o proprietario";
  const onboardingUrl = new URL("/onboarding/company", resolveAppBaseUrl(payload.request)).toString();
  const escapedRecipientName = escapeHtml(recipientName);
  const escapedOrganizationName = escapeHtml(payload.organizationName);
  const escapedDeletedByName = escapeHtml(deletedByName);

  const subject = `A organizacao ${payload.organizationName} foi excluida`;
  const text =
    `${recipientName}, a organizacao ${payload.organizationName} foi excluida por ${deletedByName}.` +
    `\n\nSe precisar continuar no sistema, crie uma nova organizacao.` +
    `\n\nCriar organizacao: ${onboardingUrl}`;
  const html = renderBrandedEmailHtml({
    request: payload.request,
    subject,
    title: "Organizacao removida",
    messageHtml: `Ola, <strong>${escapedRecipientName}</strong>. A organizacao <strong>${escapedOrganizationName}</strong> foi removida por <strong>${escapedDeletedByName}</strong>.`,
    ctaLabel: "Criar nova organizacao",
    ctaUrl: onboardingUrl,
    footerHtml: "Se essa exclusao nao era esperada, entre em contato com o owner da organizacao.",
  });

  await sendTransactionalEmail({
    to: payload.recipientEmail,
    subject,
    text,
    html,
  });
}

export async function sendSubscriptionEndingSoonEmail(
  payload: SubscriptionEndingSoonEmailPayload,
): Promise<void> {
  const recipientName = toRecipientName(payload.recipientName, payload.recipientEmail);
  const billingUrl = new URL("/billing", resolveAppBaseUrl(payload.request)).toString();
  const periodEndsAtLabel = formatDateTimeForEmail(payload.periodEndsAt);
  const escapedRecipientName = escapeHtml(recipientName);
  const escapedPlanName = escapeHtml(payload.planName);
  const escapedOrganizationName = escapeHtml(payload.organizationName);
  const escapedPeriodEndsAt = escapeHtml(periodEndsAtLabel);

  const subject = `Aviso de vencimento: ${payload.planName} termina em ${periodEndsAtLabel}`;
  const text =
    `${recipientName}, o plano ${payload.planName} da organizacao ${payload.organizationName} foi marcado para encerrar no fim do periodo.` +
    `\n\nData prevista: ${periodEndsAtLabel}` +
    `\n\nGerenciar assinatura: ${billingUrl}`;
  const html = renderBrandedEmailHtml({
    request: payload.request,
    subject,
    title: "Plano perto do vencimento",
    messageHtml: `Ola, <strong>${escapedRecipientName}</strong>. O plano <strong>${escapedPlanName}</strong> da organizacao <strong>${escapedOrganizationName}</strong> termina em <strong>${escapedPeriodEndsAt}</strong>.`,
    ctaLabel: "Revisar assinatura",
    ctaUrl: billingUrl,
    footerHtml: "Se quiser manter o plano ativo, acesse o billing e reative antes do vencimento.",
  });

  await sendTransactionalEmail({
    to: payload.recipientEmail,
    subject,
    text,
    html,
  });
}

export async function sendSubscriptionCanceledEmail(
  payload: SubscriptionCanceledEmailPayload,
): Promise<void> {
  const recipientName = toRecipientName(payload.recipientName, payload.recipientEmail);
  const billingUrl = new URL("/billing", resolveAppBaseUrl(payload.request)).toString();
  const canceledAtLabel = formatDateTimeForEmail(payload.canceledAt);
  const escapedRecipientName = escapeHtml(recipientName);
  const escapedPlanName = escapeHtml(payload.planName);
  const escapedOrganizationName = escapeHtml(payload.organizationName);
  const escapedCanceledAt = escapeHtml(canceledAtLabel);

  const subject = `Plano cancelado: ${payload.planName}`;
  const text =
    `${recipientName}, o plano ${payload.planName} da organizacao ${payload.organizationName} foi cancelado em ${canceledAtLabel}.` +
    `\n\nSe quiser voltar para um plano pago, acesse o billing: ${billingUrl}`;
  const html = renderBrandedEmailHtml({
    request: payload.request,
    subject,
    title: "Plano cancelado",
    messageHtml: `Ola, <strong>${escapedRecipientName}</strong>. O plano <strong>${escapedPlanName}</strong> da organizacao <strong>${escapedOrganizationName}</strong> foi cancelado em <strong>${escapedCanceledAt}</strong>.`,
    ctaLabel: "Gerenciar assinatura",
    ctaUrl: billingUrl,
    footerHtml: "Voce pode contratar novamente um plano pago a qualquer momento na area de billing.",
  });

  await sendTransactionalEmail({
    to: payload.recipientEmail,
    subject,
    text,
    html,
  });
}

export async function sendEmailChangeNotifications(
  payload: EmailChangeNotificationPayload,
): Promise<void> {
  const recipientName = toRecipientName(payload.recipientName, payload.currentEmail);
  const profileUrl = new URL("/profile", resolveAppBaseUrl(payload.request)).toString();
  const escapedRecipientName = escapeHtml(recipientName);
  const escapedCurrentEmail = escapeHtml(payload.currentEmail);
  const escapedNewEmail = escapeHtml(payload.newEmail);

  const currentEmailSubject = "Solicitacao de alteracao de e-mail";
  const currentEmailText =
    `${recipientName}, recebemos uma solicitacao para alterar o e-mail de acesso de ${payload.currentEmail} para ${payload.newEmail}.` +
    `\n\nSe voce nao reconhece esta acao, altere sua senha imediatamente.` +
    `\n\nRevisar perfil: ${profileUrl}`;
  const currentEmailHtml = renderBrandedEmailHtml({
    request: payload.request,
    subject: currentEmailSubject,
    title: "Alteracao de e-mail solicitada",
    messageHtml: `Ola, <strong>${escapedRecipientName}</strong>. Recebemos uma solicitacao para trocar o e-mail de acesso de <strong>${escapedCurrentEmail}</strong> para <strong>${escapedNewEmail}</strong>.`,
    ctaLabel: "Revisar seguranca",
    ctaUrl: profileUrl,
    footerHtml: "Se voce nao solicitou essa alteracao, altere sua senha e revise a seguranca da conta.",
  });

  await sendTransactionalEmail({
    to: payload.currentEmail,
    subject: currentEmailSubject,
    text: currentEmailText,
    html: currentEmailHtml,
  });

  const newEmailSubject = "Novo e-mail vinculado a sua conta";
  const newEmailText =
    `${payload.newEmail}, este endereco foi informado para acesso a uma conta no ${getAppName()}.` +
    "\n\nConclua a verificacao no e-mail de confirmacao enviado automaticamente." +
    `\n\nAcessar perfil: ${profileUrl}`;
  const newEmailHtml = renderBrandedEmailHtml({
    request: payload.request,
    subject: newEmailSubject,
    title: "Confirme seu novo e-mail",
    messageHtml: `Este endereco <strong>${escapedNewEmail}</strong> foi informado para acesso da conta de <strong>${escapedRecipientName}</strong>. Conclua a confirmacao no e-mail de verificacao enviado automaticamente.`,
    ctaLabel: "Abrir perfil",
    ctaUrl: profileUrl,
    footerHtml: "Se voce nao reconhece esta solicitacao, ignore este e-mail.",
  });

  await sendTransactionalEmail({
    to: payload.newEmail,
    subject: newEmailSubject,
    text: newEmailText,
    html: newEmailHtml,
  });
}

export async function sendSuspiciousLoginEmail(
  payload: SuspiciousLoginEmailPayload,
): Promise<void> {
  const recipientName = toRecipientName(payload.recipientName, payload.recipientEmail);
  const profileUrl = new URL("/profile", resolveAppBaseUrl(payload.request)).toString();
  const loggedInAtLabel = formatDateTimeForEmail(payload.loggedInAt);
  const normalizedIpAddress = normalizeSessionIpAddress(payload.ipAddress) || "Nao informado";
  const userAgentLabel = payload.userAgent?.trim() || "Nao informado";
  const escapedRecipientName = escapeHtml(recipientName);
  const escapedLoggedInAt = escapeHtml(loggedInAtLabel);
  const escapedIpAddress = escapeHtml(normalizedIpAddress);
  const escapedUserAgent = escapeHtml(userAgentLabel);

  const reasonLabel =
    payload.isNewDevice && payload.isNewLocation
      ? "novo dispositivo e nova localizacao"
      : payload.isNewDevice
        ? "novo dispositivo"
        : "nova localizacao";
  const escapedReasonLabel = escapeHtml(reasonLabel);

  const subject = "Alerta de seguranca: novo login detectado";
  const text =
    `${recipientName}, detectamos um login com ${reasonLabel} na sua conta.` +
    `\n\nQuando: ${loggedInAtLabel}` +
    `\nIP: ${normalizedIpAddress}` +
    `\nDispositivo: ${userAgentLabel}` +
    "\n\nSe foi voce, nenhuma acao e necessaria." +
    `\nSe voce nao reconhece este acesso, altere sua senha imediatamente e revise a seguranca da conta: ${profileUrl}`;
  const html = renderBrandedEmailHtml({
    request: payload.request,
    subject,
    title: "Novo login detectado",
    messageHtml: `Ola, <strong>${escapedRecipientName}</strong>. Detectamos um login com <strong>${escapedReasonLabel}</strong> na sua conta.<br><br><strong>Quando:</strong> ${escapedLoggedInAt}<br><strong>IP:</strong> ${escapedIpAddress}<br><strong>Dispositivo:</strong> ${escapedUserAgent}`,
    ctaLabel: "Revisar seguranca da conta",
    ctaUrl: profileUrl,
    footerHtml: "Se voce nao reconhece este acesso, altere sua senha imediatamente e revise os metodos de acesso no perfil.",
  });

  await sendTransactionalEmail({
    to: payload.recipientEmail,
    subject,
    text,
    html,
  });
}

export async function sendInvitationAcceptedEmail(
  payload: InvitationAcceptedEmailPayload,
): Promise<void> {
  const inviterName = toRecipientName(payload.inviterName, payload.inviterEmail);
  const acceptedUserName = toRecipientName(payload.acceptedUserName, payload.acceptedUserEmail);
  const dashboardUrl = new URL("/dashboard", resolveAppBaseUrl(payload.request)).toString();
  const escapedInviterName = escapeHtml(inviterName);
  const escapedAcceptedUserName = escapeHtml(acceptedUserName);
  const escapedOrganizationName = escapeHtml(payload.organizationName);

  const subject = `${acceptedUserName} aceitou o convite`;
  const text =
    `${inviterName}, ${acceptedUserName} aceitou o convite e entrou na organizacao ${payload.organizationName}.` +
    `\n\nAbrir dashboard: ${dashboardUrl}`;
  const html = renderBrandedEmailHtml({
    request: payload.request,
    subject,
    title: "Convite aceito",
    messageHtml: `Ola, <strong>${escapedInviterName}</strong>. <strong>${escapedAcceptedUserName}</strong> aceitou o convite e agora faz parte da organizacao <strong>${escapedOrganizationName}</strong>.`,
    ctaLabel: "Abrir dashboard",
    ctaUrl: dashboardUrl,
    footerHtml: "Voce pode revisar o acesso e as permissoes da equipe no painel de organizacao.",
  });

  await sendTransactionalEmail({
    to: payload.inviterEmail,
    subject,
    text,
    html,
  });
}

export async function sendMemberRoleChangedEmail(
  payload: MemberRoleChangedEmailPayload,
): Promise<void> {
  const recipientName = toRecipientName(payload.recipientName, payload.recipientEmail);
  const changedByName = payload.changedByName?.trim() || "um administrador";
  const previousRoleLabel = toMembershipRoleLabel(payload.previousRole);
  const newRoleLabel = toMembershipRoleLabel(payload.newRole);
  const profileUrl = new URL("/profile", resolveAppBaseUrl(payload.request)).toString();
  const escapedRecipientName = escapeHtml(recipientName);
  const escapedChangedByName = escapeHtml(changedByName);
  const escapedOrganizationName = escapeHtml(payload.organizationName);
  const escapedPreviousRole = escapeHtml(previousRoleLabel);
  const escapedNewRole = escapeHtml(newRoleLabel);

  const subject = `Seu cargo foi atualizado em ${payload.organizationName}`;
  const text =
    `${recipientName}, seu cargo na organizacao ${payload.organizationName} foi alterado por ${changedByName}.` +
    `\n\nCargo anterior: ${previousRoleLabel}` +
    `\nNovo cargo: ${newRoleLabel}` +
    `\n\nVer perfil: ${profileUrl}`;
  const html = renderBrandedEmailHtml({
    request: payload.request,
    subject,
    title: "Cargo atualizado",
    messageHtml: `Ola, <strong>${escapedRecipientName}</strong>. Seu cargo na organizacao <strong>${escapedOrganizationName}</strong> foi atualizado por <strong>${escapedChangedByName}</strong> de <strong>${escapedPreviousRole}</strong> para <strong>${escapedNewRole}</strong>.`,
    ctaLabel: "Ver meu perfil",
    ctaUrl: profileUrl,
    footerHtml: "Se essa alteracao nao era esperada, entre em contato com o owner da organizacao.",
  });

  await sendTransactionalEmail({
    to: payload.recipientEmail,
    subject,
    text,
    html,
  });
}

export async function sendOwnershipTransferredEmail(
  payload: OwnershipTransferredEmailPayload,
): Promise<void> {
  const recipientName = toRecipientName(payload.recipientName, payload.recipientEmail);
  const counterpartName = payload.counterpartName?.trim() || "outro membro";
  const managementUrl = new URL("/profile", resolveAppBaseUrl(payload.request)).toString();
  const escapedRecipientName = escapeHtml(recipientName);
  const escapedCounterpartName = escapeHtml(counterpartName);
  const escapedOrganizationName = escapeHtml(payload.organizationName);

  const isReceived = payload.transferType === "received";
  const subject = isReceived
    ? `Voce agora e owner de ${payload.organizationName}`
    : `Ownership transferido em ${payload.organizationName}`;
  const text = isReceived
    ? `${recipientName}, a propriedade da organizacao ${payload.organizationName} foi transferida para voce por ${counterpartName}.\n\nGerenciar organizacao: ${managementUrl}`
    : `${recipientName}, a propriedade da organizacao ${payload.organizationName} foi transferida para ${counterpartName}.\n\nGerenciar organizacao: ${managementUrl}`;
  const html = renderBrandedEmailHtml({
    request: payload.request,
    subject,
    title: isReceived ? "Voce agora e owner" : "Ownership transferido",
    messageHtml: isReceived
      ? `Ola, <strong>${escapedRecipientName}</strong>. A propriedade da organizacao <strong>${escapedOrganizationName}</strong> foi transferida para voce por <strong>${escapedCounterpartName}</strong>.`
      : `Ola, <strong>${escapedRecipientName}</strong>. A propriedade da organizacao <strong>${escapedOrganizationName}</strong> foi transferida para <strong>${escapedCounterpartName}</strong>.`,
    ctaLabel: "Gerenciar organizacao",
    ctaUrl: managementUrl,
    footerHtml: "Revise os acessos e responsabilidades para manter a governanca da equipe.",
  });

  await sendTransactionalEmail({
    to: payload.recipientEmail,
    subject,
    text,
    html,
  });
}

export async function sendPasswordChangedEmail(
  payload: PasswordChangedEmailPayload,
): Promise<void> {
  const recipientName = toRecipientName(payload.recipientName, payload.recipientEmail);
  const securityUrl = new URL("/profile", resolveAppBaseUrl(payload.request)).toString();
  const escapedRecipientName = escapeHtml(recipientName);

  const subject = "Senha da conta alterada";
  const text =
    `${recipientName}, a senha da sua conta foi alterada com sucesso.` +
    `\n\nSe voce nao reconhece esta alteracao, redefina sua senha imediatamente.` +
    `\n\nRevisar seguranca: ${securityUrl}`;
  const html = renderBrandedEmailHtml({
    request: payload.request,
    subject,
    title: "Senha alterada",
    messageHtml: `Ola, <strong>${escapedRecipientName}</strong>. A senha da sua conta foi alterada.`,
    ctaLabel: "Revisar seguranca",
    ctaUrl: securityUrl,
    footerHtml: "Se voce nao foi responsavel por essa acao, redefina a senha imediatamente.",
  });

  await sendTransactionalEmail({
    to: payload.recipientEmail,
    subject,
    text,
    html,
  });
}

export async function sendTwoFactorChangedEmail(
  payload: TwoFactorChangedEmailPayload,
): Promise<void> {
  const recipientName = toRecipientName(payload.recipientName, payload.recipientEmail);
  const securityUrl = new URL("/profile", resolveAppBaseUrl(payload.request)).toString();
  const escapedRecipientName = escapeHtml(recipientName);
  const statusLabel = payload.enabled ? "ativada" : "desativada";

  const subject = payload.enabled ? "2FA ativado na sua conta" : "2FA desativado na sua conta";
  const text =
    `${recipientName}, a autenticacao em dois fatores foi ${statusLabel} na sua conta.` +
    `\n\nRevisar seguranca: ${securityUrl}`;
  const html = renderBrandedEmailHtml({
    request: payload.request,
    subject,
    title: payload.enabled ? "2FA ativado" : "2FA desativado",
    messageHtml: `Ola, <strong>${escapedRecipientName}</strong>. A autenticacao em dois fatores foi <strong>${statusLabel}</strong> na sua conta.`,
    ctaLabel: "Abrir seguranca",
    ctaUrl: securityUrl,
    footerHtml: "Se voce nao reconhece esta acao, altere sua senha imediatamente.",
  });

  await sendTransactionalEmail({
    to: payload.recipientEmail,
    subject,
    text,
    html,
  });
}

export async function sendPaymentApprovedEmail(
  payload: PaymentApprovedEmailPayload,
): Promise<void> {
  const recipientName = toRecipientName(payload.recipientName, payload.recipientEmail);
  const amountLabel = formatMoneyForEmail(payload.amountCents, payload.currency);
  const paidAtLabel = formatDateTimeForEmail(payload.paidAt);
  const targetUrl =
    payload.receiptUrl?.trim() ||
    payload.billingUrl?.trim() ||
    new URL("/billing", resolveAppBaseUrl(payload.request)).toString();
  const escapedRecipientName = escapeHtml(recipientName);
  const escapedPlanName = escapeHtml(payload.planName);
  const escapedOrganizationName = escapeHtml(payload.organizationName);
  const escapedAmountLabel = escapeHtml(amountLabel);
  const escapedPaidAt = escapeHtml(paidAtLabel);

  const subject = `Pagamento aprovado: ${payload.planName}`;
  const text =
    `${recipientName}, recebemos o pagamento de ${amountLabel} para o plano ${payload.planName} da organizacao ${payload.organizationName}.` +
    `\n\nData: ${paidAtLabel}` +
    `\nAcessar recibo/fatura: ${targetUrl}`;
  const html = renderBrandedEmailHtml({
    request: payload.request,
    subject,
    title: "Pagamento aprovado",
    messageHtml: `Ola, <strong>${escapedRecipientName}</strong>. Confirmamos o pagamento de <strong>${escapedAmountLabel}</strong> no plano <strong>${escapedPlanName}</strong> da organizacao <strong>${escapedOrganizationName}</strong> em <strong>${escapedPaidAt}</strong>.`,
    ctaLabel: "Ver recibo",
    ctaUrl: targetUrl,
    footerHtml: "Guarde este comprovante para controle interno de faturamento.",
  });

  await sendTransactionalEmail({
    to: payload.recipientEmail,
    subject,
    text,
    html,
  });
}

export async function sendPaymentFailedDunningEmail(
  payload: PaymentFailedDunningEmailPayload,
): Promise<void> {
  const recipientName = toRecipientName(payload.recipientName, payload.recipientEmail);
  const billingUrl =
    payload.billingUrl?.trim() || new URL("/billing", resolveAppBaseUrl(payload.request)).toString();
  const graceEndsLabel = payload.graceEndsAt ? formatDateTimeForEmail(payload.graceEndsAt) : null;
  const escapedRecipientName = escapeHtml(recipientName);
  const escapedPlanName = escapeHtml(payload.planName);
  const escapedOrganizationName = escapeHtml(payload.organizationName);
  const escapedGraceEndsLabel = graceEndsLabel ? escapeHtml(graceEndsLabel) : null;

  const subject = `Falha no pagamento - dia ${payload.dunningDay}`;
  const text =
    `${recipientName}, nao conseguimos processar a cobranca do plano ${payload.planName} da organizacao ${payload.organizationName}.` +
    `\n\nEste e o aviso do dia ${payload.dunningDay} da sequencia de cobranca.` +
    (graceEndsLabel ? `\nPrazo de regularizacao: ${graceEndsLabel}` : "") +
    `\n\nAtualizar pagamento: ${billingUrl}`;
  const html = renderBrandedEmailHtml({
    request: payload.request,
    subject,
    title: "Falha no pagamento",
    messageHtml: escapedGraceEndsLabel
      ? `Ola, <strong>${escapedRecipientName}</strong>. Nao conseguimos processar a cobranca do plano <strong>${escapedPlanName}</strong> da organizacao <strong>${escapedOrganizationName}</strong>. Este e o aviso do <strong>dia ${payload.dunningDay}</strong>. Regularize ate <strong>${escapedGraceEndsLabel}</strong>.`
      : `Ola, <strong>${escapedRecipientName}</strong>. Nao conseguimos processar a cobranca do plano <strong>${escapedPlanName}</strong> da organizacao <strong>${escapedOrganizationName}</strong>. Este e o aviso do <strong>dia ${payload.dunningDay}</strong>.`,
    ctaLabel: "Atualizar pagamento",
    ctaUrl: billingUrl,
    footerHtml: "Regularize o pagamento para evitar downgrade e restricoes no plano.",
  });

  await sendTransactionalEmail({
    to: payload.recipientEmail,
    subject,
    text,
    html,
  });
}

export async function sendPlanUsageThresholdEmail(
  payload: PlanUsageThresholdEmailPayload,
): Promise<void> {
  const recipientName = toRecipientName(payload.recipientName, payload.recipientEmail);
  const billingUrl = new URL("/billing", resolveAppBaseUrl(payload.request)).toString();
  const metricLabel = toUsageMetricLabel(payload.metric);
  const escapedRecipientName = escapeHtml(recipientName);
  const escapedMetricLabel = escapeHtml(metricLabel);
  const escapedPlanName = escapeHtml(payload.planName);
  const escapedOrganizationName = escapeHtml(payload.organizationName);

  const subject =
    payload.threshold === 100
      ? `Limite atingido de ${metricLabel}`
      : `Alerta: ${payload.threshold}% do limite de ${metricLabel}`;
  const text =
    `${recipientName}, a organizacao ${payload.organizationName} atingiu ${payload.current}/${payload.maxAllowed} em ${metricLabel} no plano ${payload.planName}.` +
    `\n\nGerenciar plano: ${billingUrl}`;
  const html = renderBrandedEmailHtml({
    request: payload.request,
    subject,
    title: payload.threshold === 100 ? "Limite atingido" : "Uso proximo do limite",
    messageHtml: `Ola, <strong>${escapedRecipientName}</strong>. A organizacao <strong>${escapedOrganizationName}</strong> esta em <strong>${payload.current}/${payload.maxAllowed}</strong> de <strong>${escapedMetricLabel}</strong> no plano <strong>${escapedPlanName}</strong>.`,
    ctaLabel: "Gerenciar plano",
    ctaUrl: billingUrl,
    footerHtml: "Considere upgrade ou ajuste de uso para manter a operacao sem bloqueios.",
  });

  await sendTransactionalEmail({
    to: payload.recipientEmail,
    subject,
    text,
    html,
  });
}

export async function maybeSendPlanUsageThresholdAlerts(
  input: {
    organizationId: string;
    request?: Request;
  },
): Promise<void> {
  const organizationId = input.organizationId.trim();
  if (!organizationId) {
    return;
  }

  try {
    const entitlements = await getOwnerEntitlements(organizationId);
    const owner = await prisma.user.findUnique({
      where: {
        id: entitlements.ownerUserId,
      },
      select: {
        email: true,
        name: true,
      },
    });

    const ownerEmail = owner?.email?.trim().toLowerCase() || "";
    if (!ownerEmail) {
      return;
    }

    const organization = await prisma.organization.findUnique({
      where: {
        id: organizationId,
      },
      select: {
        name: true,
      },
    });

    const organizationName = organization?.name?.trim() || "organizacao";
    const planDefinition = getPlanDefinition(entitlements.effectivePlanCode);
    const planName = planDefinition.name;
    const usersInUse = entitlements.usage.users + entitlements.usage.pendingInvitations;
    const monthToken = currentYearMonthToken();
    const metrics: Array<{
      metric: UsageAlertMetric;
      current: number;
      maxAllowed: number | null;
    }> = [
      {
        metric: "users",
        current: usersInUse,
        maxAllowed: planDefinition.limits.maxUsers,
      },
      {
        metric: "projects",
        current: entitlements.usage.projects,
        maxAllowed: planDefinition.limits.maxProjects,
      },
      {
        metric: "monthly_usage",
        current: entitlements.usage.monthlyUsage,
        maxAllowed: planDefinition.limits.maxMonthlyUsage,
      },
    ];

    for (const metric of metrics) {
      if (metric.maxAllowed === null) {
        continue;
      }

      const reachedThreshold = usageThresholdReached(metric.current, metric.maxAllowed);
      if (!reachedThreshold || !USAGE_ALERT_THRESHOLDS.includes(reachedThreshold)) {
        continue;
      }

      const markerId = [
        "usage_alert",
        organizationId,
        metric.metric,
        String(reachedThreshold),
        monthToken,
      ].join(":");
      const markerCreated = await acquireInternalNotificationMarker(markerId, "usage.alert", {
        organizationId,
        metric: metric.metric,
        threshold: reachedThreshold,
        current: metric.current,
        maxAllowed: metric.maxAllowed,
        monthToken,
      });

      if (!markerCreated) {
        continue;
      }

      await sendPlanUsageThresholdEmail({
        recipientEmail: ownerEmail,
        recipientName: owner?.name?.trim() || null,
        organizationName,
        planName,
        metric: metric.metric,
        threshold: reachedThreshold,
        current: metric.current,
        maxAllowed: metric.maxAllowed,
        request: input.request,
      });
    }
  } catch (error) {
    console.error("Falha ao enviar alerta de limite de plano.", error);
  }
}

export const auth = betterAuth({
  baseURL: getPrimaryAppBaseUrl(),
  secret: getAuthSecret(),
  trustedOrigins: getTrustedOrigins(),
  rateLimit: {
    enabled: true,
    storage: "memory",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in": {
        window: 60,
        max: 5,
      },
      "/sign-up": {
        window: 60,
        max: 3,
      },
      "/request-password-reset": {
        window: 60,
        max: 3,
      },
      "/change-email": {
        window: 60,
        max: 5,
      },
    },
  },
  advanced: {
    useSecureCookies: isProduction(),
    cookiePrefix: getAuthCookiePrefix(),
    ipAddress: {
      ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for", "x-real-ip"],
      ipv6Subnet: 64,
    },
  },
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  databaseHooks: {
    user: {
      create: {
        after: async (user, context) => {
          if (!context || !shouldSendWelcomeEmailForUserCreate(context.path)) {
            return;
          }

          const userEmail = typeof user.email === "string" ? user.email.trim() : "";
          if (!userEmail) {
            return;
          }

          const userId = typeof user.id === "string" ? user.id.trim() : "";
          if (!userId) {
            return;
          }

          const userName = typeof user.name === "string" ? user.name : null;

          try {
            await maybeSendSignUpThankYouEmail(
              {
                user: {
                  id: userId,
                  name: userName,
                  email: userEmail,
                },
              },
              context.request,
            );
          } catch (error) {
            console.error("Failed to send sign-up thank-you email.", error);
          }
        },
      },
      update: {
        after: async (user, context) => {
          if (!context) {
            return;
          }

          const path = context.path || "";
          if (path !== TWO_FACTOR_VERIFY_TOTP_PATH && path !== "/two-factor/disable") {
            return;
          }

          const userEmail = typeof user.email === "string" ? user.email.trim() : "";
          if (!userEmail) {
            return;
          }

          try {
            await sendTwoFactorChangedEmail({
              recipientEmail: userEmail,
              recipientName: typeof user.name === "string" ? user.name : null,
              enabled: path === "/two-factor/verify-totp",
              request: context.request,
            });
          } catch (error) {
            console.error("Failed to send 2FA status email.", error);
          }

          const userId = typeof user.id === "string" ? user.id.trim() : "";
          if (!userId) {
            return;
          }

          await logPlatformEvent({
            source: "auth",
            action: "security.two_factor_changed",
            severity: PlatformEventSeverity.INFO,
            actorUserId: userId,
            targetType: "user",
            targetId: userId,
            metadata: {
              enabled: path === "/two-factor/verify-totp",
              path,
            },
          });
        },
      },
    },
    session: {
      create: {
        after: async (session, context) => {
          if (!context) {
            return;
          }

          const userId = typeof session.userId === "string" ? session.userId : "";
          const sessionId = typeof session.id === "string" ? session.id : "";
          if (!userId || !sessionId) {
            return;
          }

          const path = context.path || "";
          const occurredAtCandidate =
            session.createdAt instanceof Date
              ? session.createdAt
              : new Date(String(session.createdAt ?? ""));
          const occurredAt = Number.isNaN(occurredAtCandidate.getTime()) ? null : occurredAtCandidate;

          const blockedUser = await prisma.user.findUnique({
            where: {
              id: userId,
            },
            select: {
              platformStatus: true,
              platformBlockedReason: true,
            },
          });

          if (blockedUser?.platformStatus === "BLOCKED") {
            await prisma.session.deleteMany({
              where: {
                id: sessionId,
                userId,
              },
            });

            await logPlatformEvent({
              source: "auth",
              action: "login.blocked",
              severity: PlatformEventSeverity.WARN,
              actorUserId: userId,
              targetType: "user",
              targetId: userId,
              metadata: {
                path,
                reason: blockedUser.platformBlockedReason ?? null,
                channel: "session-create",
              },
            });

            throw new APIError("FORBIDDEN", {
              message: "Conta bloqueada pela administracao da plataforma.",
            });
          }

          await logPlatformEvent({
            source: "auth",
            action: "session.created",
            severity: PlatformEventSeverity.INFO,
            actorUserId: userId,
            targetType: "session",
            targetId: sessionId,
            metadata: {
              path,
              loggedInAt: occurredAt?.toISOString() ?? null,
              ipAddress: typeof session.ipAddress === "string" ? session.ipAddress : null,
              userAgent: typeof session.userAgent === "string" ? session.userAgent : null,
            },
          });

          if (!shouldSendSuspiciousLoginEmailForSessionCreate(path)) {
            return;
          }

          if (!occurredAt) {
            return;
          }

          const currentUserAgentFingerprint = normalizeSessionUserAgent(
            typeof session.userAgent === "string" ? session.userAgent : null,
          );
          const currentNetworkFingerprint = toSessionNetworkFingerprint(
            typeof session.ipAddress === "string" ? session.ipAddress : null,
          );
          if (!currentUserAgentFingerprint && !currentNetworkFingerprint) {
            return;
          }

          const [user, previousSessions] = await Promise.all([
            prisma.user.findUnique({
              where: {
                id: userId,
              },
              select: {
                email: true,
                name: true,
              },
            }),
            prisma.session.findMany({
              where: {
                userId,
                id: {
                  not: sessionId,
                },
              },
              orderBy: [
                {
                  createdAt: "desc",
                },
              ],
              take: 10,
              select: {
                userAgent: true,
                ipAddress: true,
              },
            }),
          ]);

          const recipientEmail = user?.email?.trim().toLowerCase() || "";
          if (!recipientEmail || previousSessions.length === 0) {
            return;
          }

          const isKnownDevice = currentUserAgentFingerprint
            ? previousSessions.some(
              (previousSession) =>
                normalizeSessionUserAgent(previousSession.userAgent) === currentUserAgentFingerprint,
            )
            : false;
          const isKnownLocation = currentNetworkFingerprint
            ? previousSessions.some(
              (previousSession) =>
                toSessionNetworkFingerprint(previousSession.ipAddress) === currentNetworkFingerprint,
            )
            : false;

          const isNewDevice = Boolean(currentUserAgentFingerprint) && !isKnownDevice;
          const isNewLocation = Boolean(currentNetworkFingerprint) && !isKnownLocation;
          if (!isNewDevice && !isNewLocation) {
            return;
          }

          try {
            await sendSuspiciousLoginEmail({
              recipientEmail,
              recipientName: user?.name ?? null,
              loggedInAt: occurredAt,
              ipAddress: typeof session.ipAddress === "string" ? session.ipAddress : null,
              userAgent: typeof session.userAgent === "string" ? session.userAgent : null,
              isNewDevice,
              isNewLocation,
              request: context.request,
            });
          } catch (error) {
            console.error("Failed to send suspicious-login email.", error);
          }
        },
      },
    },
    account: {
      update: {
        after: async (account, context) => {
          if (!context) {
            return;
          }

          const path = context.path || "";
          if (path !== "/change-password" && path !== "/set-password" && path !== "/reset-password") {
            return;
          }

          const providerId = typeof account.providerId === "string" ? account.providerId : "";
          const userId = typeof account.userId === "string" ? account.userId : "";
          if (providerId !== "credential" || !userId) {
            return;
          }

          const user = await prisma.user.findUnique({
            where: {
              id: userId,
            },
            select: {
              email: true,
              name: true,
            },
          });

          const recipientEmail = user?.email?.trim() || "";
          if (!recipientEmail) {
            return;
          }

          try {
            await sendPasswordChangedEmail({
              recipientEmail,
              recipientName: user?.name ?? null,
              request: context.request,
            });
          } catch (error) {
            console.error("Failed to send password-changed email.", error);
          }

          await logPlatformEvent({
            source: "auth",
            action: "security.password_changed",
            severity: PlatformEventSeverity.INFO,
            actorUserId: userId,
            targetType: "user",
            targetId: userId,
            metadata: {
              path,
              providerId,
            },
          });
        },
      },
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendAccountVerificationEmail({
        user: {
          name: user.name,
          email: user.email,
        },
        url,
      });
    },
    afterEmailVerification: async (user, request) => {
      const userEmail = typeof user.email === "string" ? user.email.trim() : "";
      const userId = typeof user.id === "string" ? user.id.trim() : "";
      if (!userEmail || !userId) {
        return;
      }

      try {
        await maybeSendSignUpThankYouEmail(
          {
            user: {
              id: userId,
              name: user.name,
              email: userEmail,
            },
          },
          request,
        );
      } catch (error) {
        console.error("Failed to send post-verification welcome email.", error);
      }
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendResetPasswordEmail({
        user: {
          name: user.name,
          email: user.email,
        },
        url,
      });
    },
  },
  account: {
    accountLinking: {
      trustedProviders: ["google"],
    },
  },
  socialProviders: (() => {
    const googleConfig = getGoogleSocialProviderConfig();

    if (!googleConfig) {
      return undefined;
    }

    return {
      google: googleConfig,
    };
  })(),
  user: {
    changeEmail: {
      enabled: true,
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== SIGN_IN_EMAIL_PATH) {
        return;
      }

      await dedupeCredentialAccountsForEmail(ctx.body?.email);
      await assertEmailUserNotPlatformBlocked(ctx.body?.email, ctx.path);
    }),
  },
  plugins: [
    organization({
      creatorRole: "owner",
      cancelPendingInvitationsOnReInvite: true,
      organizationHooks: {
        beforeCreateOrganization: async ({ user }) => {
          try {
            await assertOwnerCanCreateOrganization(user.id);
          } catch (error) {
            throw new APIError("FORBIDDEN", {
              message: toErrorMessage(error, "Limite de organizacoes atingido para este owner."),
            });
          }
        },
        afterCreateOrganization: async ({ organization, user }) => {
          await ensureOwnerSubscription(organization.id, {
            ownerUserIdHint: user.id,
          });
        },
        beforeCreateInvitation: async ({ invitation }) => {
          try {
            await assertOrganizationCanCreateInvitation(
              invitation.organizationId,
              invitation.email.toLowerCase(),
            );
          } catch (error) {
            throw new APIError("FORBIDDEN", {
              message: toErrorMessage(error, "Limite de usuarios atingido no plano atual."),
            });
          }
        },
        afterCreateInvitation: async ({ invitation }) => {
          await maybeSendPlanUsageThresholdAlerts({
            organizationId: invitation.organizationId,
          });
        },
        beforeAcceptInvitation: async ({ invitation }) => {
          try {
            await assertOrganizationCanAcceptInvitation(
              invitation.organizationId,
              invitation.id,
            );
          } catch (error) {
            throw new APIError("FORBIDDEN", {
              message: toErrorMessage(error, "Limite de usuarios atingido no plano atual."),
            });
          }
        },
        afterAcceptInvitation: async ({ invitation, user, organization }) => {
          const inviterId = typeof invitation.inviterId === "string" ? invitation.inviterId.trim() : "";
          const acceptedUserEmail =
            typeof user.email === "string" ? user.email.trim().toLowerCase() : "";

          if (inviterId && acceptedUserEmail) {
            const inviter = await prisma.user.findUnique({
              where: {
                id: inviterId,
              },
              select: {
                email: true,
                name: true,
              },
            });
            const inviterEmail = inviter?.email?.trim().toLowerCase() || "";

            if (inviterEmail) {
              try {
                await sendInvitationAcceptedEmail({
                  inviterEmail,
                  inviterName: inviter?.name ?? null,
                  acceptedUserEmail,
                  acceptedUserName: typeof user.name === "string" ? user.name : null,
                  organizationName: organization.name || "organizacao",
                });
              } catch (error) {
                console.error("Failed to send invitation-accepted email.", error);
              }
            }
          }

          await maybeSendPlanUsageThresholdAlerts({
            organizationId: invitation.organizationId,
          });
        },
        beforeAddMember: async ({ member }) => {
          try {
            // Better Auth chama `beforeAddMember` durante a criacao da organizacao,
            // antes do primeiro registro de member existir. Garanta a assinatura
            // com um hint para evitar "Organizacao sem proprietario...".
            await ensureOwnerSubscription(member.organizationId, {
              ownerUserIdHint: member.userId,
            });

            await assertOrganizationCanAddMember(member.organizationId, member.userId);
          } catch (error) {
            throw new APIError("FORBIDDEN", {
              message: toErrorMessage(error, "Limite de usuarios atingido no plano atual."),
            });
          }
        },
        afterAddMember: async ({ member }) => {
          await maybeSendPlanUsageThresholdAlerts({
            organizationId: member.organizationId,
          });
        },
        afterUpdateMemberRole: async ({ member, previousRole, user, organization }) => {
          let recipientEmail =
            typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
          let recipientName: string | null = typeof user.name === "string" ? user.name : null;

          if (!recipientEmail) {
            const affectedUser = await prisma.user.findUnique({
              where: {
                id: member.userId,
              },
              select: {
                email: true,
                name: true,
              },
            });

            recipientEmail = affectedUser?.email?.trim().toLowerCase() || "";
            recipientName = affectedUser?.name ?? recipientName;
          }

          if (recipientEmail) {
            try {
              await sendMemberRoleChangedEmail({
                recipientEmail,
                recipientName,
                organizationName: organization.name || "organizacao",
                previousRole,
                newRole: member.role,
                changedByName: null,
              });
            } catch (error) {
              console.error("Failed to send role-changed email.", error);
            }
          }

          const wasOwner = hasOrganizationRole(previousRole, "owner");
          const isOwner = hasOrganizationRole(member.role, "owner");
          if (wasOwner === isOwner || !recipientEmail) {
            return;
          }

          if (isOwner) {
            const previousOwnerMember = await prisma.member.findFirst({
              where: {
                organizationId: member.organizationId,
                userId: {
                  not: member.userId,
                },
                role: {
                  contains: "owner",
                },
              },
              orderBy: {
                createdAt: "asc",
              },
              select: {
                userId: true,
              },
            });
            const previousOwner = previousOwnerMember
              ? await prisma.user.findUnique({
                  where: {
                    id: previousOwnerMember.userId,
                  },
                  select: {
                    email: true,
                    name: true,
                  },
                })
              : null;

            try {
              await sendOwnershipTransferredEmail({
                recipientEmail,
                recipientName,
                organizationName: organization.name || "organizacao",
                transferType: "received",
                counterpartName: previousOwner?.name || previousOwner?.email || null,
              });
            } catch (error) {
              console.error("Failed to send ownership-transfer email (received).", error);
            }
            return;
          }

          const newOwnerMember = await prisma.member.findFirst({
            where: {
              organizationId: member.organizationId,
              userId: {
                not: member.userId,
              },
              role: {
                contains: "owner",
              },
            },
            orderBy: {
              createdAt: "asc",
            },
            select: {
              userId: true,
            },
          });
          const newOwner = newOwnerMember
            ? await prisma.user.findUnique({
                where: {
                  id: newOwnerMember.userId,
                },
                select: {
                  email: true,
                  name: true,
                },
              })
            : null;

          try {
            await sendOwnershipTransferredEmail({
              recipientEmail,
              recipientName,
              organizationName: organization.name || "organizacao",
              transferType: "transferred",
              counterpartName: newOwner?.name || newOwner?.email || null,
            });
          } catch (error) {
            console.error("Failed to send ownership-transfer email (transferred).", error);
          }
        },
      },
      sendInvitationEmail: async (data, request) => {
        await sendOrganizationInvitationEmail(data, request);
      },
    }),
    twoFactor({
      issuer: getTwoFactorIssuer(),
      totpOptions: {
        digits: 6,
        period: 30,
      },
      backupCodeOptions: {
        amount: 10,
        length: 10,
      },
    }),
    jwt(),
    nextCookies(),
  ],
});
