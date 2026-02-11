import { redirect } from "next/navigation";

import { MarketingLanding } from "@/components/app/marketing-landing";
import { getTenantContext } from "@/lib/organization/tenant-context";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const tenantContext = await getTenantContext();

  if (!tenantContext.session?.user) {
    return <MarketingLanding />;
  }

  if (!tenantContext.organizationId) {
    redirect("/onboarding/company");
  }

  redirect("/dashboard");
}
