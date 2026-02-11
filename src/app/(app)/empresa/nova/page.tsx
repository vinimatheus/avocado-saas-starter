import { redirect } from "next/navigation";

import { AppPageContainer } from "@/components/app/app-page-container";
import { CompanyOnboardingForm } from "@/components/auth/company-onboarding-form";
import { getTenantContext } from "@/lib/organization/tenant-context";

export const dynamic = "force-dynamic";

export default async function NewOrganizationPage() {
  const tenantContext = await getTenantContext();

  if (!tenantContext.session?.user) {
    redirect("/sign-in");
  }

  if (!tenantContext.organizationId) {
    redirect("/onboarding/company");
  }

  return (
    <AppPageContainer className="items-center justify-center py-8">
      <CompanyOnboardingForm
        userName={tenantContext.session.user.name}
        mode="create"
        redirectPath="/dashboard"
        keepCurrentActiveOrganization
      />
    </AppPageContainer>
  );
}
