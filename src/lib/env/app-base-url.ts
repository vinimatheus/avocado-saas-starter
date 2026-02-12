export const DEFAULT_APP_BASE_URL = "http://localhost:3000";

type ExplicitAppBaseUrlResolution = {
  hasConfiguredValue: boolean;
  origin: string | null;
};

const HTTP_PROTOCOL_REGEX = /^https?:\/\//i;

function toOrigin(input: string): string | null {
  try {
    return new URL(input).origin;
  } catch {
    return null;
  }
}

export function resolveExplicitAppBaseUrlFromEnv(): ExplicitAppBaseUrlResolution {
  const configuredBaseUrl =
    process.env.BETTER_AUTH_URL?.trim() ||
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL?.trim() ||
    process.env.BETTER_AUTH_BASE_URL?.trim() ||
    "";

  if (!configuredBaseUrl) {
    return {
      hasConfiguredValue: false,
      origin: null,
    };
  }

  return {
    hasConfiguredValue: true,
    origin: toOrigin(configuredBaseUrl),
  };
}

export function resolveVercelAppBaseUrlFromEnv(): string | null {
  const vercelHostOrUrl =
    process.env.VERCEL_URL?.trim() ||
    process.env.NEXT_PUBLIC_VERCEL_URL?.trim() ||
    process.env.VERCEL_BRANCH_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    "";

  if (!vercelHostOrUrl) {
    return null;
  }

  const normalizedUrl = HTTP_PROTOCOL_REGEX.test(vercelHostOrUrl)
    ? vercelHostOrUrl
    : `https://${vercelHostOrUrl}`;

  return toOrigin(normalizedUrl);
}
