import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { auth } from "@/lib/auth/server";
import { getTenantContext } from "@/lib/organization/tenant-context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: {
    default: "Area interna",
    template: "%s | Area interna | Avocado SaaS Starter",
  },
  description:
    "Area interna do SaaS para operacao do produto com painel, equipe, faturamento, perfil e catalogo.",
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
