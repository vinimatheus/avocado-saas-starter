const DEFAULT_ABACATEPAY_BASE_URL = "https://api.abacatepay.com/v1";
const ABACATEPAY_TIMEOUT_MS = 10_000;
const DEFAULT_ABACATEPAY_CHECKOUT_ALLOWED_HOSTS = ["abacatepay.com"] as const;

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export type AbacateBillingStatus = "PENDING" | "EXPIRED" | "CANCELLED" | "PAID" | "REFUNDED";

type AbacateApiEnvelope<T> = {
  data: T | null;
  error: unknown;
};

export type AbacateCustomer = {
  id: string;
  name: string;
  cellphone: string;
  email: string;
  taxId: string;
};

export type AbacateBilling = {
  id: string;
  url: string;
  status: AbacateBillingStatus;
  amount?: number;
  paidAmount?: number;
  currency?: string;
  methods: Array<"PIX" | "CARD">;
  frequency: "ONE_TIME" | "MULTIPLE_PAYMENTS";
  products: Array<{
    id?: string;
    externalId?: string;
    quantity: number;
    price?: number;
  }>;
  createdAt?: string;
  updatedAt?: string;
};

type AbacateCreateBillingPayload = {
  frequency: "ONE_TIME" | "MULTIPLE_PAYMENTS";
  methods: Array<"PIX" | "CARD">;
  products: Array<{
    externalId: string;
    name: string;
    description?: string;
    quantity: number;
    price: number;
  }>;
  returnUrl: string;
  completionUrl: string;
  customerId?: string;
  customer?: {
    name: string;
    cellphone: string;
    email: string;
    taxId: string;
  };
  allowCoupons?: boolean;
  coupons?: string[];
  externalId?: string;
  metadata?: Record<string, unknown>;
};

function getAbacateApiBaseUrl(): string {
  const configured = process.env.ABACATEPAY_BASE_URL?.trim() || DEFAULT_ABACATEPAY_BASE_URL;

  try {
    const parsed = new URL(configured);
    if (isProduction() && parsed.protocol !== "https:") {
      throw new Error("ABACATEPAY_BASE_URL deve usar HTTPS em produção.");
    }
    return parsed.origin + parsed.pathname.replace(/\/+$/, "");
  } catch {
    throw new Error("ABACATEPAY_BASE_URL inválida.");
  }
}

function getAbacateApiKey(): string {
  const token = process.env.ABACATEPAY_API_KEY?.trim();
  if (!token) {
    throw new Error("ABACATEPAY_API_KEY nao configurada.");
  }

  return token;
}

export function getAbacateWebhookSecret(): string {
  const secret = process.env.ABACATEPAY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error("ABACATEPAY_WEBHOOK_SECRET nao configurada.");
  }

  return secret;
}

export function getAbacateWebhookSignatureKey(): string | null {
  return process.env.ABACATEPAY_WEBHOOK_SIGNATURE_KEY?.trim() || null;
}

function getAllowedCheckoutHosts(): string[] {
  const configured = process.env.ABACATEPAY_ALLOWED_CHECKOUT_HOSTS?.trim();
  if (!configured) {
    return [...DEFAULT_ABACATEPAY_CHECKOUT_ALLOWED_HOSTS];
  }

  const hosts = configured
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return hosts.length > 0 ? hosts : [...DEFAULT_ABACATEPAY_CHECKOUT_ALLOWED_HOSTS];
}

function hostMatchesAllowedHost(hostname: string, allowedHost: string): boolean {
  return hostname === allowedHost || hostname.endsWith(`.${allowedHost}`);
}

export function isTrustedAbacateCheckoutUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  const allowedHosts = getAllowedCheckoutHosts();
  return allowedHosts.some((allowedHost) => hostMatchesAllowedHost(hostname, allowedHost));
}

export function isAbacatePayConfigured(): boolean {
  return Boolean(process.env.ABACATEPAY_API_KEY?.trim());
}

async function requestAbacate<TResponse>(
  path: string,
  init: RequestInit,
): Promise<TResponse> {
  const response = await fetch(`${getAbacateApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getAbacateApiKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "saas-starter/1.0",
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(ABACATEPAY_TIMEOUT_MS),
  });

  const payload = (await response.json().catch(() => null)) as AbacateApiEnvelope<TResponse> | null;

  if (!response.ok) {
    const remoteError =
      payload && typeof payload.error === "string"
        ? payload.error
        : "Falha ao comunicar com a API do AbacatePay.";
    throw new Error(`${remoteError} (HTTP ${response.status})`);
  }

  if (!payload || payload.data === null) {
    const remoteError =
      payload && typeof payload.error === "string"
        ? payload.error
        : "Resposta invalida da API do AbacatePay.";
    throw new Error(remoteError);
  }

  return payload.data;
}

export async function createAbacateCustomer(input: {
  name: string;
  cellphone: string;
  email: string;
  taxId: string;
}): Promise<AbacateCustomer> {
  return requestAbacate<AbacateCustomer>("/customer/create", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createAbacateBilling(
  input: AbacateCreateBillingPayload,
): Promise<AbacateBilling> {
  return requestAbacate<AbacateBilling>("/billing/create", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listAbacateBillings(): Promise<AbacateBilling[]> {
  return requestAbacate<AbacateBilling[]>("/billing/list", {
    method: "GET",
  });
}
