import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { Prisma, PlatformEventSeverity } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import {
  resolveExplicitAppBaseUrlFromEnv,
  resolveVercelAppBaseUrlFromEnv,
} from "@/lib/env/app-base-url";
import { verifyStarterImpersonationToken } from "@/lib/platform-admin/impersonation-token";
import { logPlatformEvent } from "@/lib/platform/events";

const DEFAULT_NEXT_PATH = "/dashboard";
const IMPERSONATION_SESSION_SECONDS = 60 * 60;
const DEFAULT_AUTH_COOKIE_PREFIX = "avocado-starter-auth";

function resolveSafePath(path: string, fallbackPath: string): string {
  const trimmed = path.trim();
  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallbackPath;
  }

  return trimmed;
}

function getAuthCookiePrefix(): string {
  const configuredPrefix = process.env.BETTER_AUTH_COOKIE_PREFIX?.trim() || "";
  return configuredPrefix || DEFAULT_AUTH_COOKIE_PREFIX;
}

function getAuthSecret(): string | null {
  const secret = process.env.BETTER_AUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim() || "";
  if (!secret || secret.length < 32) {
    return null;
  }

  return secret;
}

function createSignedCookieValue(value: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(value).digest("base64");
  return `${value}.${signature}`;
}

function getAuthSessionCookieName(): string {
  const cookiePrefix = getAuthCookiePrefix();
  const securePrefix = process.env.NODE_ENV === "production" ? "__Secure-" : "";
  return `${securePrefix}${cookiePrefix}.session_token`;
}

function getAuthSessionDataCookieName(): string {
  const cookiePrefix = getAuthCookiePrefix();
  const securePrefix = process.env.NODE_ENV === "production" ? "__Secure-" : "";
  return `${securePrefix}${cookiePrefix}.session_data`;
}

function parseRequestCookieNames(request: NextRequest): string[] {
  const cookieHeader = request.headers.get("cookie") ?? "";
  if (!cookieHeader) {
    return [];
  }

  return cookieHeader
    .split(";")
    .map((part) => part.split("=")[0]?.trim() ?? "")
    .filter(Boolean);
}

function expireSessionDataCookies(response: NextResponse, request: NextRequest): void {
  const secure = process.env.NODE_ENV === "production";
  const sessionDataCookieName = getAuthSessionDataCookieName();
  const cookieNames = new Set<string>([sessionDataCookieName]);

  for (const cookieName of parseRequestCookieNames(request)) {
    if (cookieName === sessionDataCookieName || cookieName.startsWith(`${sessionDataCookieName}.`)) {
      cookieNames.add(cookieName);
    }
  }

  for (const cookieName of cookieNames) {
    response.cookies.set({
      name: cookieName,
      value: "",
      expires: new Date(0),
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
    });
  }
}

function getRequestIpAddress(request: NextRequest): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for")?.trim() || "";
  if (forwardedFor) {
    const firstForwarded = forwardedFor
      .split(",")
      .map((value) => value.trim())
      .find(Boolean);

    return firstForwarded || null;
  }

  const realIp = request.headers.get("x-real-ip")?.trim() || "";
  return realIp || null;
}

function toOrigin(value: string | null | undefined): string | null {
  const normalizedValue = typeof value === "string" ? value.trim() : "";
  if (!normalizedValue) {
    return null;
  }

  try {
    return new URL(normalizedValue).origin;
  } catch {
    return null;
  }
}

function getTrustedOriginsFromEnv(): string[] {
  const configured = process.env.TRUSTED_ORIGINS?.trim() || "";
  if (!configured) {
    return [];
  }

  return configured
    .split(",")
    .map((value) => toOrigin(value))
    .filter((value): value is string => Boolean(value));
}

function resolveTrustedRequestOrigins(request: NextRequest): Set<string> {
  const origins = new Set<string>([request.nextUrl.origin]);

  const explicitBaseUrl = resolveExplicitAppBaseUrlFromEnv();
  if (explicitBaseUrl.origin) {
    origins.add(explicitBaseUrl.origin);
  }

  const vercelBaseUrl = resolveVercelAppBaseUrlFromEnv();
  if (vercelBaseUrl) {
    origins.add(vercelBaseUrl);
  }

  for (const trustedOrigin of getTrustedOriginsFromEnv()) {
    origins.add(trustedOrigin);
  }

  return origins;
}

function hasTrustedRequestOrigin(request: NextRequest): boolean {
  const trustedOrigins = resolveTrustedRequestOrigins(request);

  const originHeader = toOrigin(request.headers.get("origin"));
  if (originHeader) {
    return trustedOrigins.has(originHeader);
  }

  const refererHeader = toOrigin(request.headers.get("referer"));
  if (refererHeader) {
    return trustedOrigins.has(refererHeader);
  }

  return false;
}

function redirectToSignIn(request: NextRequest, nextPath: string): NextResponse {
  const signInUrl = new URL("/sign-in", request.nextUrl.origin);
  signInUrl.searchParams.set("next", resolveSafePath(nextPath, DEFAULT_NEXT_PATH));
  return NextResponse.redirect(signInUrl);
}

function hasOwnerRole(role: string | null | undefined): boolean {
  return (role ?? "").trim().toLowerCase() === "owner";
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function markTokenAsUsed(tokenId: string, expiresAt: Date): Promise<boolean> {
  try {
    await prisma.verification.create({
      data: {
        id: `admin-impersonation:${tokenId}`,
        identifier: "starter-admin-impersonation",
        value: "used",
        expiresAt,
      },
    });

    return true;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return false;
    }

    throw error;
  }
}

export const runtime = "nodejs";

type ImpersonationRequestInput = {
  token: string;
  nextPath: string;
};

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

async function parseImpersonationInput(request: NextRequest): Promise<ImpersonationRequestInput> {
  const fallbackNextPath = resolveSafePath(
    request.nextUrl.searchParams.get("next")?.trim() || "",
    DEFAULT_NEXT_PATH,
  );
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as
      | { token?: unknown; next?: unknown; nextPath?: unknown }
      | null;
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const nextPath = resolveSafePath(
      typeof body?.nextPath === "string"
        ? body.nextPath
        : typeof body?.next === "string"
          ? body.next
          : fallbackNextPath,
      DEFAULT_NEXT_PATH,
    );

    return {
      token,
      nextPath,
    };
  }

  const formData = await request.formData().catch(() => null);
  const token = typeof formData?.get("token") === "string" ? String(formData?.get("token")).trim() : "";
  const nextPathValue = formData?.get("next");
  const nextPath = resolveSafePath(
    typeof nextPathValue === "string" ? nextPathValue : fallbackNextPath,
    DEFAULT_NEXT_PATH,
  );

  return {
    token,
    nextPath,
  };
}

async function completeImpersonation(
  request: NextRequest,
  input: ImpersonationRequestInput,
): Promise<NextResponse> {
  if (!input.token) {
    return noStore(redirectToSignIn(request, input.nextPath));
  }

  const claims = verifyStarterImpersonationToken(input.token);
  if (!claims) {
    return noStore(redirectToSignIn(request, input.nextPath));
  }

  const authSecret = getAuthSecret();
  if (!authSecret) {
    return noStore(redirectToSignIn(request, input.nextPath));
  }

  const tokenConsumed = await markTokenAsUsed(claims.jti, new Date(claims.exp * 1000));
  if (!tokenConsumed) {
    return noStore(redirectToSignIn(request, input.nextPath));
  }

  const [platformAdmin, membership] = await Promise.all([
    prisma.platformAdmin.findFirst({
      where: {
        id: claims.actorAdminId,
        userId: claims.actorUserId,
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    }),
    prisma.member.findUnique({
      where: {
        organizationId_userId: {
          organizationId: claims.organizationId,
          userId: claims.targetUserId,
        },
      },
      select: {
        id: true,
        role: true,
      },
    }),
  ]);

  if (!platformAdmin || !membership || !hasOwnerRole(membership.role)) {
    return noStore(redirectToSignIn(request, input.nextPath));
  }

  const now = Date.now();
  const expiresAt = new Date(now + IMPERSONATION_SESSION_SECONDS * 1000);
  const sessionId = randomUUID();
  const sessionToken = randomBytes(32).toString("hex");
  const ipAddress = getRequestIpAddress(request);
  const userAgent = request.headers.get("user-agent")?.trim() || null;

  await prisma.session.create({
    data: {
      id: sessionId,
      token: sessionToken,
      userId: claims.targetUserId,
      activeOrganizationId: claims.organizationId,
      expiresAt,
      ipAddress,
      userAgent,
    },
  });

  await logPlatformEvent({
    source: "starter",
    action: "starter.impersonation.session_created",
    severity: PlatformEventSeverity.INFO,
    actorUserId: claims.actorUserId,
    actorAdminId: claims.actorAdminId,
    organizationId: claims.organizationId,
    targetType: "session",
    targetId: sessionId,
    metadata: {
      targetUserId: claims.targetUserId,
      impersonationTokenId: claims.jti,
      requestIpAddress: ipAddress,
      requestUserAgent: userAgent,
    },
  });

  const secure = process.env.NODE_ENV === "production";
  const signedSessionCookieValue = createSignedCookieValue(sessionToken, authSecret);
  const response = NextResponse.redirect(new URL(input.nextPath, request.nextUrl.origin));
  response.cookies.set({
    name: getAuthSessionCookieName(),
    value: signedSessionCookieValue,
    expires: expiresAt,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
  });
  expireSessionDataCookies(response, request);

  return noStore(response);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const nextPath = resolveSafePath(
    request.nextUrl.searchParams.get("next")?.trim() || "",
    DEFAULT_NEXT_PATH,
  );
  return noStore(redirectToSignIn(request, nextPath));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const nextPath = resolveSafePath(
    request.nextUrl.searchParams.get("next")?.trim() || "",
    DEFAULT_NEXT_PATH,
  );

  if (!hasTrustedRequestOrigin(request)) {
    return noStore(redirectToSignIn(request, nextPath));
  }

  const input = await parseImpersonationInput(request);
  return completeImpersonation(request, input);
}
