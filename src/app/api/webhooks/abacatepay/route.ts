import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

import { NextResponse } from "next/server";

import {
  getAbacateWebhookSignatureKey,
  getAbacateWebhookSecret,
} from "@/lib/billing/abacatepay";
import { processAbacateWebhook } from "@/lib/billing/subscription-service";

export const runtime = "nodejs";
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;
const DEFAULT_WEBHOOK_RATE_LIMIT_MAX = 120;
const DEFAULT_WEBHOOK_RATE_LIMIT_WINDOW_SECONDS = 60;
const webhookRateLimitStore = new Map<string, { count: number; resetAt: number }>();

function parsePositiveInt(input: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(input?.trim() ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

const WEBHOOK_RATE_LIMIT_MAX = parsePositiveInt(
  process.env.ABACATEPAY_WEBHOOK_RATE_LIMIT_MAX,
  DEFAULT_WEBHOOK_RATE_LIMIT_MAX,
);
const WEBHOOK_RATE_LIMIT_WINDOW_SECONDS = parsePositiveInt(
  process.env.ABACATEPAY_WEBHOOK_RATE_LIMIT_WINDOW_SECONDS,
  DEFAULT_WEBHOOK_RATE_LIMIT_WINDOW_SECONDS,
);
const WEBHOOK_RATE_LIMIT_WINDOW_MS = WEBHOOK_RATE_LIMIT_WINDOW_SECONDS * 1000;

function normalizeIp(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (isIP(trimmed)) {
    return trimmed;
  }

  const withoutPort = trimmed.split(":");
  if (withoutPort.length === 2 && isIP(withoutPort[0])) {
    return withoutPort[0];
  }

  return null;
}

const ALLOWED_WEBHOOK_IPS = new Set(
  (process.env.ABACATEPAY_WEBHOOK_ALLOWED_IPS ?? "")
    .split(",")
    .map((value) => normalizeIp(value))
    .filter((value): value is string => Boolean(value)),
);

function getClientIp(request: Request): string | null {
  const cfConnectingIp = normalizeIp(request.headers.get("cf-connecting-ip") ?? "");
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  const xRealIp = normalizeIp(request.headers.get("x-real-ip") ?? "");
  if (xRealIp) {
    return xRealIp;
  }

  const xForwardedFor = request.headers.get("x-forwarded-for") ?? "";
  const firstForwardedIp = xForwardedFor
    .split(",")
    .map((value) => normalizeIp(value))
    .find((value): value is string => Boolean(value));
  if (firstForwardedIp) {
    return firstForwardedIp;
  }

  return null;
}

function checkRateLimit(clientKey: string): { limited: boolean; retryAfterSeconds: number } {
  const now = Date.now();

  for (const [key, entry] of webhookRateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      webhookRateLimitStore.delete(key);
    }
  }

  const existing = webhookRateLimitStore.get(clientKey);
  if (!existing || existing.resetAt <= now) {
    webhookRateLimitStore.set(clientKey, {
      count: 1,
      resetAt: now + WEBHOOK_RATE_LIMIT_WINDOW_MS,
    });
    return {
      limited: false,
      retryAfterSeconds: WEBHOOK_RATE_LIMIT_WINDOW_SECONDS,
    };
  }

  if (existing.count >= WEBHOOK_RATE_LIMIT_MAX) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return {
      limited: true,
      retryAfterSeconds,
    };
  }

  existing.count += 1;
  webhookRateLimitStore.set(clientKey, existing);

  return {
    limited: false,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

function safeCompareSignature(expectedSignature: string, receivedSignature: string): boolean {
  const expectedBuffer = Buffer.from(expectedSignature);
  const receivedBuffer = Buffer.from(receivedSignature);

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

function safeCompareSecret(expectedSecret: string, receivedSecret: string): boolean {
  const expectedBuffer = Buffer.from(expectedSecret);
  const receivedBuffer = Buffer.from(receivedSecret);

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

function unauthorized(message: string) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
    },
    {
      status: 401,
    },
  );
}

function forbidden(message: string) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
    },
    {
      status: 403,
    },
  );
}

function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      ok: false,
      error: "Limite de requisições do webhook excedido.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

function getReceivedWebhookSecret(request: Request): string {
  const headerSecret = request.headers.get("x-webhook-secret")?.trim() || "";
  if (headerSecret) {
    return headerSecret;
  }

  let querySecret = "";

  try {
    const url = new URL(request.url);
    querySecret =
      url.searchParams.get("webhookSecret")?.trim() ||
      url.searchParams.get("secret")?.trim() ||
      "";
  } catch {
    querySecret = "";
  }

  return querySecret;
}

export async function POST(request: Request) {
  const clientIp = getClientIp(request);
  if (ALLOWED_WEBHOOK_IPS.size > 0 && (!clientIp || !ALLOWED_WEBHOOK_IPS.has(clientIp))) {
    return forbidden("Origem do webhook não permitida.");
  }

  const rateLimitKey = clientIp ?? "unknown";
  const rateLimitResult = checkRateLimit(rateLimitKey);
  if (rateLimitResult.limited) {
    return tooManyRequests(rateLimitResult.retryAfterSeconds);
  }

  let webhookSecret: string;

  try {
    webhookSecret = getAbacateWebhookSecret();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Webhook não configurado no servidor.",
      },
      {
        status: 500,
      },
    );
  }

  const receivedSecret = getReceivedWebhookSecret(request);
  if (!receivedSecret) {
    return unauthorized(
      "Webhook secret ausente. Envie no header x-webhook-secret ou query string webhookSecret.",
    );
  }

  if (!safeCompareSecret(webhookSecret, receivedSecret)) {
    return unauthorized("Webhook secret inválido.");
  }

  const signatureHeader = request.headers.get("x-webhook-signature")?.trim() || "";
  const contentLengthHeader = request.headers.get("content-length")?.trim() || "";
  const contentLength = Number(contentLengthHeader);

  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: "Payload excede o limite permitido.",
      },
      {
        status: 413,
      },
    );
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: "Payload excede o limite permitido.",
      },
      {
        status: 413,
      },
    );
  }

  const signatureKey = getAbacateWebhookSignatureKey();
  if (!signatureKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "ABACATEPAY_WEBHOOK_SIGNATURE_KEY não configurada no servidor.",
      },
      {
        status: 500,
      },
    );
  }

  if (!signatureHeader) {
    return unauthorized("Assinatura do webhook ausente.");
  }

  const expectedSignature = createHmac("sha256", signatureKey)
    .update(Buffer.from(rawBody))
    .digest("base64");

  if (!safeCompareSignature(expectedSignature, signatureHeader)) {
    return unauthorized("Assinatura do webhook inválida.");
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Payload JSON inválido.",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const result = await processAbacateWebhook(payload);

    return NextResponse.json({
      ok: true,
      duplicate: result.duplicate,
      processed: result.processed,
    });
  } catch (error) {
    console.error("Falha ao processar webhook do AbacatePay.", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Falha interna ao processar webhook.",
      },
      {
        status: 500,
      },
    );
  }
}
