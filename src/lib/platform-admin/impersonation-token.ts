import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = 1;
const MAX_TOKEN_AGE_SECONDS = 120;
const MAX_CLOCK_SKEW_SECONDS = 30;

export type StarterImpersonationClaims = {
  v: number;
  iat: number;
  exp: number;
  jti: string;
  actorUserId: string;
  actorAdminId: string;
  targetUserId: string;
  organizationId: string;
};

function getImpersonationSecret(): string | null {
  const secret = process.env.ADMIN_STARTER_IMPERSONATION_SECRET?.trim() || "";
  if (!secret || secret.length < 32) {
    return null;
  }

  return secret;
}

function createSignature(payloadEncoded: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadEncoded).digest("base64url");
}

function isValidTokenPayload(value: unknown): value is StarterImpersonationClaims {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    record.v === TOKEN_VERSION &&
    typeof record.iat === "number" &&
    Number.isFinite(record.iat) &&
    typeof record.exp === "number" &&
    Number.isFinite(record.exp) &&
    typeof record.jti === "string" &&
    record.jti.trim().length > 0 &&
    typeof record.actorUserId === "string" &&
    record.actorUserId.trim().length > 0 &&
    typeof record.actorAdminId === "string" &&
    record.actorAdminId.trim().length > 0 &&
    typeof record.targetUserId === "string" &&
    record.targetUserId.trim().length > 0 &&
    typeof record.organizationId === "string" &&
    record.organizationId.trim().length > 0
  );
}

export function verifyStarterImpersonationToken(
  token: string,
): StarterImpersonationClaims | null {
  const tokenParts = token.split(".");
  if (tokenParts.length !== 2) {
    return null;
  }
  const [payloadEncoded, providedSignature] = tokenParts;
  if (!payloadEncoded || !providedSignature) {
    return null;
  }

  const secret = getImpersonationSecret();
  if (!secret) {
    return null;
  }

  const expectedSignature = createSignature(payloadEncoded, secret);
  const providedSignatureBuffer = Buffer.from(providedSignature, "utf8");
  const expectedSignatureBuffer = Buffer.from(expectedSignature, "utf8");
  if (providedSignatureBuffer.length !== expectedSignatureBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(providedSignatureBuffer, expectedSignatureBuffer)) {
    return null;
  }

  let parsedPayload: unknown = null;
  try {
    parsedPayload = JSON.parse(Buffer.from(payloadEncoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!isValidTokenPayload(parsedPayload)) {
    return null;
  }

  const nowInSeconds = Math.floor(Date.now() / 1000);
  if (parsedPayload.iat > nowInSeconds + MAX_CLOCK_SKEW_SECONDS) {
    return null;
  }

  const tokenAgeInSeconds = nowInSeconds - parsedPayload.iat;
  if (tokenAgeInSeconds > MAX_TOKEN_AGE_SECONDS || parsedPayload.exp <= nowInSeconds) {
    return null;
  }

  return parsedPayload;
}
