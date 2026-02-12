import type { Metadata } from "next";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";

type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>;

function getSingleSearchParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function resolveCallbackPath(value: string): string {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return "/";
  }
  if (!normalizedValue.startsWith("/")) {
    return "/";
  }
  if (normalizedValue.startsWith("//")) {
    return "/";
  }

  return normalizedValue;
}

export const metadata: Metadata = {
  title: "Redefinir senha",
  description:
    "Defina uma nova senha com seguranca para recuperar o acesso ao seu workspace no avocado SaaS Starter.",
  alternates: {
    canonical: "/reset-password",
  },
  openGraph: {
    title: "Redefinir senha da conta",
    description:
      "Finalize a recuperacao da sua conta definindo uma nova senha para continuar seu fluxo no produto.",
    url: "/reset-password",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Redefinir senha da conta",
    description:
      "Finalize a recuperacao da sua conta definindo uma nova senha para continuar seu fluxo no produto.",
  },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const token = getSingleSearchParam(resolvedSearchParams.token).trim() || null;
  const tokenError = getSingleSearchParam(resolvedSearchParams.error).trim() || null;
  const callbackPath = resolveCallbackPath(getSingleSearchParam(resolvedSearchParams.next));

  return <ResetPasswordForm token={token} tokenError={tokenError} callbackPath={callbackPath} />;
}
