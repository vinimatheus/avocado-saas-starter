import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { jwt, organization, twoFactor } from "better-auth/plugins";
import { APIError } from "better-call";

import {
  assertOrganizationCanAddMember,
  assertOrganizationCanAcceptInvitation,
  assertOrganizationCanCreateInvitation,
  assertOwnerCanCreateOrganization,
  ensureOwnerSubscription,
} from "@/lib/billing/subscription-service";
import { prisma } from "@/lib/db/prisma";
import {
  DEFAULT_APP_BASE_URL,
  resolveExplicitAppBaseUrlFromEnv,
  resolveVercelAppBaseUrlFromEnv,
} from "@/lib/env/app-base-url";

const INVITATION_ACCEPT_PATH = "/convites/aceitar";
const DEFAULT_APP_NAME = "avocado SaaS";
const RESEND_TIMEOUT_MS = 10_000;

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

function getTwoFactorIssuer(): string {
  const configuredIssuer = process.env.BETTER_AUTH_2FA_ISSUER?.trim();
  if (configuredIssuer) {
    return configuredIssuer;
  }

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

function getBrandedEmailAssetUrl(assetPath: string, request?: Request): string {
  return new URL(assetPath, resolveAppBaseUrl(request)).toString();
}

function renderBrandedEmailHtml(payload: BrandedEmailTemplatePayload): string {
  const appName = escapeHtml(process.env.NEXT_PUBLIC_APP_NAME?.trim() || DEFAULT_APP_NAME);
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
    ipAddress: {
      ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for", "x-real-ip"],
      ipv6Subnet: 64,
    },
  },
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
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
        afterCreateOrganization: async ({ user }) => {
          await ensureOwnerSubscription(user.id);
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
        beforeAddMember: async ({ member }) => {
          try {
            await assertOrganizationCanAddMember(member.organizationId, member.userId);
          } catch (error) {
            throw new APIError("FORBIDDEN", {
              message: toErrorMessage(error, "Limite de usuarios atingido no plano atual."),
            });
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
