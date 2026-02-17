import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CompanyOnboardingForm } from "@/components/auth/company-onboarding-form";
import { getTenantContext } from "@/lib/organization/tenant-context";

type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>;

function getSingleSearchParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function sanitizeRedirectPath(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return "/";
  }

  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return "/";
  }

  return normalized;
}

export const metadata: Metadata = {
  title: "Primeiros passos da organizacao",
  description: "Conclua a etapa inicial da sua organizacao para iniciar o uso da area.",
  alternates: {
    canonical: "/onboarding/company",
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      "max-image-preview": "none",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default async function CompanyOnboardingPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const initialCompanyName = getSingleSearchParam(resolvedSearchParams.company);
  const redirectPath = sanitizeRedirectPath(getSingleSearchParam(resolvedSearchParams.next));
  const tenantContext = await getTenantContext();

  if (!tenantContext.session?.user) {
    redirect("/sign-in");
  }

  if (tenantContext.organizationId) {
    redirect("/");
  }

  return (
    <main className="bg-muted/40 flex min-h-screen items-center justify-center px-4 py-10">
      <CompanyOnboardingForm
        userName={tenantContext.session.user.name}
        userImage={(tenantContext.session.user as { image?: string | null }).image ?? null}
        initialCompanyName={initialCompanyName}
        redirectPath={redirectPath}
      />
    </main>
  );
}
