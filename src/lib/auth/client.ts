"use client";

import { createAuthClient } from "better-auth/react";
import { jwtClient, organizationClient, twoFactorClient } from "better-auth/client/plugins";

const configuredBaseUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL?.trim();
const vercelBaseUrl = process.env.NEXT_PUBLIC_VERCEL_URL?.trim();
const authClientBaseUrl =
  configuredBaseUrl ||
  (vercelBaseUrl
    ? `https://${vercelBaseUrl.replace(/^https?:\/\//i, "")}`
    : undefined);

export const authClient = createAuthClient({
  baseURL: authClientBaseUrl,
  plugins: [jwtClient(), organizationClient(), twoFactorClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
