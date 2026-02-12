import { DEFAULT_APP_BASE_URL } from "@/lib/env/app-base-url";

const HTTP_PROTOCOL_REGEX = /^https?:\/\//i;

const SITE_ORIGIN_CANDIDATE_KEYS = [
  "NEXT_PUBLIC_SITE_URL",
  "SITE_URL",
  "BETTER_AUTH_URL",
  "NEXT_PUBLIC_BETTER_AUTH_URL",
  "BETTER_AUTH_BASE_URL",
  "NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "NEXT_PUBLIC_VERCEL_URL",
  "VERCEL_URL",
  "VERCEL_BRANCH_URL",
] as const;

function normalizeToAbsoluteUrl(input: string): string {
  return HTTP_PROTOCOL_REGEX.test(input) ? input : `https://${input}`;
}

function toOrigin(input: string): string | null {
  try {
    return new URL(input).origin;
  } catch {
    return null;
  }
}

export function resolveSiteOrigin(): string {
  for (const key of SITE_ORIGIN_CANDIDATE_KEYS) {
    const value = process.env[key]?.trim();
    if (!value) {
      continue;
    }

    const origin = toOrigin(normalizeToAbsoluteUrl(value));
    if (origin) {
      return origin;
    }
  }

  return DEFAULT_APP_BASE_URL;
}
