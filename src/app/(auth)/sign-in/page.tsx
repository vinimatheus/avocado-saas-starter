import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/auth/sign-in-form";
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

function parseBooleanSearchParam(value: string): boolean {
  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue === "1" || normalizedValue === "true" || normalizedValue === "yes";
}

export const metadata: Metadata = {
  title: "Entrar",
  description:
    "Entre na sua conta para acessar painel, planos e gerenciamento do seu SaaS no Avocado SaaS Starter.",
  alternates: {
    canonical: "/sign-in",
  },
  openGraph: {
    title: "Entrar no Avocado SaaS Starter",
    description:
      "Acesse sua conta para continuar a gestao do seu produto com autenticacao, organizacoes e planos.",
    url: "/sign-in",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Entrar no Avocado SaaS Starter",
    description:
      "Acesse sua conta para continuar a gestao do seu produto com autenticacao, organizacoes e planos.",
  },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const callbackPath = resolveCallbackPath(getSingleSearchParam(resolvedSearchParams.next));
  const initialEmail = getSingleSearchParam(resolvedSearchParams.email);
  const showEmailVerificationHint = parseBooleanSearchParam(
    getSingleSearchParam(resolvedSearchParams.verify),
  );

  const session = await getServerSession();
  if (session?.user) {
    redirect(callbackPath);
  }

  return (
    <SignInForm
      callbackPath={callbackPath}
      initialEmail={initialEmail}
      showEmailVerificationHint={showEmailVerificationHint}
    />
  );
}
