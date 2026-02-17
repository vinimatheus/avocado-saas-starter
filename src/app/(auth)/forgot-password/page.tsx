import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getServerSession } from "@/lib/auth/session";

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
  title: "Recuperar senha",
  description:
    "Solicite o link de recuperacao de senha para voltar a acessar sua conta no Avocado SaaS Starter.",
  alternates: {
    canonical: "/forgot-password",
  },
  openGraph: {
    title: "Recuperar senha da conta",
    description:
      "Receba por e-mail um link seguro para redefinir sua senha e retornar a sua area.",
    url: "/forgot-password",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Recuperar senha da conta",
    description:
      "Receba por e-mail um link seguro para redefinir sua senha e retornar a sua area.",
  },
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const callbackPath = resolveCallbackPath(getSingleSearchParam(resolvedSearchParams.next));
  const initialEmail = getSingleSearchParam(resolvedSearchParams.email);

  const session = await getServerSession();
  if (session?.user) {
    redirect(callbackPath);
  }

  return <ForgotPasswordForm callbackPath={callbackPath} initialEmail={initialEmail} />;
}
