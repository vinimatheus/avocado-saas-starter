import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { auth } from "@/lib/auth/server";
import { getTenantContext } from "@/lib/organization/tenant-context";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const tenantContext = await getTenantContext();
  const requestHeaders = await headers();

  if (!tenantContext.session?.user) {
    redirect("/sign-in");
  }

  if (!tenantContext.organizationId) {
    redirect("/onboarding/company");
  }

  if (!tenantContext.role) {
    redirect("/onboarding/company");
  }

  const pendingInvitations = await auth.api
    .listUserInvitations({
      headers: requestHeaders,
    })
    .then((invitations) =>
      invitations.map((invitation) => ({
        id: invitation.id,
        organizationName: invitation.organizationName,
        role: invitation.role,
        createdAt: invitation.createdAt.toISOString(),
        expiresAt: invitation.expiresAt.toISOString(),
      })),
    )
    .catch(() => []);

  const userImage = (tenantContext.session.user as { image?: string | null }).image ?? null;

  return (
    <AppShell
      activeOrganizationId={tenantContext.organizationId}
      organizationName={tenantContext.organizationName}
      organizations={tenantContext.organizations}
      pendingInvitations={pendingInvitations}
      role={tenantContext.role}
      userName={tenantContext.session.user.name}
      userImage={userImage}
    >
      {children}
    </AppShell>
  );
}
