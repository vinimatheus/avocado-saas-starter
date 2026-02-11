"use client";

import { createAuthClient } from "better-auth/react";
import { jwtClient, organizationClient, twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  plugins: [jwtClient(), organizationClient(), twoFactorClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
