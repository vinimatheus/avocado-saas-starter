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
    return "Owner";
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
  const escapedInvitationUrl = escapeHtml(invitationUrl);

  const subject = `Convite para ${payload.organization.name}`;
  const text = `${inviterName} convidou você para fazer parte da equipe de ${payload.organization.name} com o cargo de ${roleLabel}.\n\nAceite o convite em: ${invitationUrl}\n\nSe você não esperava este convite, ignore este e-mail.`;
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Convite para ${escapedOrgName}</title>
</head>
<body style="background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: #ffffff; border-radius: 16px; box-shadow: 0 10px 40px -10px rgba(0,0,0,0.08); overflow: hidden; border: 1px solid #f3f4f6;">
      <!-- Minimal Header -->
      <div style="padding: 32px 32px 0; text-align: center;">
        <div style="display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; background: #f3f4f6; color: #1f2937; border-radius: 12px; font-size: 24px; margin-bottom: 24px;">
           ✉️
        </div>
      </div>

      <div style="padding: 0 32px 40px; text-align: center;">
        <h1 style="color: #111827; font-size: 24px; font-weight: 700; line-height: 32px; margin: 0 0 16px; letter-spacing: -0.025em;">
          Convite para ${escapedOrgName}
        </h1>
        <p style="color: #4b5563; font-size: 16px; line-height: 26px; margin: 0 0 32px;">
          Olá! <strong>${escapedInviterName}</strong> convidou você para fazer parte da equipe <strong>${escapedOrgName}</strong> com o cargo de <span style="color: #111827; font-weight: 600; background: #f3f4f6; padding: 2px 8px; border-radius: 6px;">${escapedRoleLabel}</span>.
        </p>
        
        <a href="${escapedInvitationUrl}" style="display: inline-block; background: #000000; color: #ffffff; padding: 14px 32px; border-radius: 9999px; font-weight: 600; text-decoration: none; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); transition: transform 0.1s ease;">
          Aceitar Convite
        </a>

        <p style="margin-top: 32px; font-size: 13px; color: #9ca3af;">
          ou cole este link no seu navegador: <br>
          <a href="${escapedInvitationUrl}" style="color: #6b7280; text-decoration: underline; word-break: break-all;">${escapedInvitationUrl}</a>
        </p>
      </div>
    
      <div style="background: #fdfdfd; padding: 24px; text-align: center; border-top: 1px solid #f3f4f6;">
         <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.5;">
           Se você não esperava por este convite, pode ignorar este e-mail tranquilamente.<br>
           Enviado via sistema.
         </p>
      </div>
    </div>
  </div>
</body>
</html>`;

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
  const escapedVerificationUrl = escapeHtml(payload.url);

  const subject = "Confirme seu e-mail";
  const text = `${recipientName}, confirme seu e-mail para liberar o acesso ao sistema.\n\nConfirme aqui: ${payload.url}\n\nSe voce nao criou essa conta, ignore este e-mail.`;
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirme seu e-mail</title>
</head>
<body style="background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: #ffffff; border-radius: 16px; box-shadow: 0 10px 40px -10px rgba(0,0,0,0.08); overflow: hidden; border: 1px solid #f3f4f6;">
      <div style="padding: 32px 32px 0; text-align: center;">
        <div style="display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; background: #f3f4f6; color: #1f2937; border-radius: 12px; font-size: 24px; margin-bottom: 24px;">
           ✓
        </div>
      </div>

      <div style="padding: 0 32px 40px; text-align: center;">
        <h1 style="color: #111827; font-size: 24px; font-weight: 700; line-height: 32px; margin: 0 0 16px; letter-spacing: -0.025em;">
          Confirme seu e-mail
        </h1>
        <p style="color: #4b5563; font-size: 16px; line-height: 26px; margin: 0 0 32px;">
          Olá, <strong>${escapedRecipientName}</strong>. Para concluir seu cadastro e liberar o acesso, confirme seu e-mail.
        </p>
        
        <a href="${escapedVerificationUrl}" style="display: inline-block; background: #000000; color: #ffffff; padding: 14px 32px; border-radius: 9999px; font-weight: 600; text-decoration: none; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); transition: transform 0.1s ease;">
          Verificar e-mail
        </a>

        <p style="margin-top: 32px; font-size: 13px; color: #9ca3af;">
          ou cole este link no seu navegador: <br>
          <a href="${escapedVerificationUrl}" style="color: #6b7280; text-decoration: underline; word-break: break-all;">${escapedVerificationUrl}</a>
        </p>
      </div>
    
      <div style="background: #fdfdfd; padding: 24px; text-align: center; border-top: 1px solid #f3f4f6;">
         <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.5;">
           Se voce nao reconhece esta acao, pode ignorar este e-mail com seguranca.<br>
           Enviado via sistema.
         </p>
      </div>
    </div>
  </div>
</body>
</html>`;

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
  const escapedResetUrl = escapeHtml(payload.url);

  const subject = "Redefinição de senha";
  const text = `${recipientName}, recebemos uma solicitação para redefinir sua senha.\n\nClique aqui para redefinir: ${payload.url}\n\nSe você não solicitou, ignore este e-mail.`;
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redefinição de senha</title>
</head>
<body style="background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: #ffffff; border-radius: 16px; box-shadow: 0 10px 40px -10px rgba(0,0,0,0.08); overflow: hidden; border: 1px solid #f3f4f6;">
      <div style="padding: 32px 32px 0; text-align: center;">
        <div style="display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; background: #f3f4f6; color: #1f2937; border-radius: 12px; font-size: 24px; margin-bottom: 24px;">
           🔒
        </div>
      </div>

      <div style="padding: 0 32px 40px; text-align: center;">
        <h1 style="color: #111827; font-size: 24px; font-weight: 700; line-height: 32px; margin: 0 0 16px; letter-spacing: -0.025em;">
          Redefinição de senha
        </h1>
        <p style="color: #4b5563; font-size: 16px; line-height: 26px; margin: 0 0 32px;">
          Olá, <strong>${escapedRecipientName}</strong>. Recebemos uma solicitação para redefinir a senha da sua conta.
        </p>
        
        <a href="${escapedResetUrl}" style="display: inline-block; background: #000000; color: #ffffff; padding: 14px 32px; border-radius: 9999px; font-weight: 600; text-decoration: none; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); transition: transform 0.1s ease;">
          Redefinir Senha
        </a>

        <p style="margin-top: 32px; font-size: 13px; color: #9ca3af;">
          ou cole este link no seu navegador: <br>
          <a href="${escapedResetUrl}" style="color: #6b7280; text-decoration: underline; word-break: break-all;">${escapedResetUrl}</a>
        </p>
      </div>
    
      <div style="background: #fdfdfd; padding: 24px; text-align: center; border-top: 1px solid #f3f4f6;">
         <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.5;">
           Se você não solicitou essa alteração, pode ignorar este e-mail com segurança.<br>
           Enviado via sistema.
         </p>
      </div>
    </div>
  </div>
</body>
</html>`;

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
