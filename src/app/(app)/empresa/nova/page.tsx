import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppPageContainer } from "@/components/app/app-page-container";
import { CompanyOnboardingForm } from "@/components/auth/company-onboarding-form";
import { getOrganizationBlockMessage } from "@/lib/billing/subscription-service";
import { getTenantContext } from "@/lib/organization/tenant-context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Nova organizacao",
  description: "Crie uma nova organizacao para operar multiplas areas dentro do seu SaaS.",
  alternates: {
    canonical: "/empresa/nova",
  },
};

export default async function NewOrganizationPage() {
  const tenantContext = await getTenantContext();

  if (!tenantContext.session?.user) {
    redirect("/sign-in");
  }

  if (!tenantContext.organizationId) {
    redirect("/onboarding/company");
  }

  const blockMessage = await getOrganizationBlockMessage(tenantContext.organizationId);
  if (blockMessage) {
    const searchParams = new URLSearchParams();
    searchParams.set("error", blockMessage);
    redirect(`/billing?${searchParams.toString()}`);
  }

  return (
    <AppPageContainer className="items-center justify-center py-8">
      <CompanyOnboardingForm
        userName={tenantContext.session.user.name}
        mode="create"
        redirectPath="/dashboard"
        keepCurrentActiveOrganization={false}
      />
    </AppPageContainer>
  );
}
