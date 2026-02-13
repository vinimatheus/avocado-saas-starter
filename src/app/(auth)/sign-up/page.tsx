import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignUpForm } from "@/components/auth/sign-up-form";
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
  title: "Criar conta",
  description:
    "Crie sua conta e inicie sua area no avocado SaaS Starter com autenticacao, cobranca e multi-tenant prontos.",
  alternates: {
    canonical: "/sign-up",
  },
  openGraph: {
    title: "Criar conta no avocado SaaS Starter",
    description:
      "Comece seu SaaS mais rapido com etapa inicial, autenticacao e estrutura multi-tenant ja implementados.",
    url: "/sign-up",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Criar conta no avocado SaaS Starter",
    description:
      "Comece seu SaaS mais rapido com etapa inicial, autenticacao e estrutura multi-tenant ja implementados.",
  },
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const callbackPath = resolveCallbackPath(getSingleSearchParam(resolvedSearchParams.next));
  const initialEmail = getSingleSearchParam(resolvedSearchParams.email);
  const skipOrganizationCreation = callbackPath.startsWith("/convites/aceitar");

  const session = await getServerSession();
  if (session?.user) {
    redirect(callbackPath);
  }

  return (
    <SignUpForm
      callbackPath={callbackPath}
      initialEmail={initialEmail}
      skipOrganizationCreation={skipOrganizationCreation}
    />
  );
}
