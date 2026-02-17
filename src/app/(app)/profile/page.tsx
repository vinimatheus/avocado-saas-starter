import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Building2Icon, ShieldCheckIcon } from "lucide-react";

import { AppPageContainer } from "@/components/app/app-page-container";
import { AppPageHighlightCard } from "@/components/app/app-page-highlight-card";
import { ProfileForm } from "@/components/auth/profile-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth/server";
import { getOrganizationBlockMessage } from "@/lib/billing/subscription-service";
import type { OrganizationUserRole } from "@/lib/organization/helpers";
import { getTenantContext } from "@/lib/organization/tenant-context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Perfil",
  description:
    "Atualize dados da conta, seguranca e identidade do usuario na area do avocado SaaS Starter.",
  alternates: {
    canonical: "/profile",
  },
};

function roleLabel(role: OrganizationUserRole | null): string {
  if (role === "owner") {
    return "Proprietario";
  }

  if (role === "admin") {
    return "Administrador";
  }

  return "Usuario";
}

export default async function ProfilePage() {
  const tenantContext = await getTenantContext();
  const user = tenantContext.session?.user;

  if (!user) {
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

  const initialTwoFactorEnabled = Boolean((user as { twoFactorEnabled?: boolean }).twoFactorEnabled);
  const initialImage = ((user as { image?: string | null }).image ?? "").trim() || null;
  const linkedAccounts = await auth.api
    .listUserAccounts({
      headers: await headers(),
    })
    .catch(() => []);
  const hasCredentialAccount = linkedAccounts.some((account) => account.providerId === "credential");
  const hasGoogleAccount = linkedAccounts.some((account) => account.providerId === "google");
  const googleProviderEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );

  return (
    <AppPageContainer className="gap-4">
      <AppPageHighlightCard
        eyebrow="Perfil"
        title="Seu perfil organizado para manter seguranca e confianca"
        description="Atualize foto, credenciais e protecao da conta em um fluxo simples e consistente."
        imageSrc="/img/profile.png"
        imageAlt="Avocado gerenciando perfil no computador"
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <ProfileForm
          initialName={user.name}
          initialEmail={user.email}
          initialImage={initialImage}
          initialTwoFactorEnabled={initialTwoFactorEnabled}
          initialHasCredentialAccount={hasCredentialAccount}
          initialHasGoogleAccount={hasGoogleAccount}
          googleProviderEnabled={googleProviderEnabled}
        />

        <Card className="h-fit lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle>Resumo da conta</CardTitle>
            <CardDescription>Status rapido da organizacao e do seu acesso atual.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">Organizacao ativa</p>
              <p className="text-sm font-medium">
                {tenantContext.organizationName || "Organizacao nao identificada"}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">Cargo</p>
              <Badge
                variant={
                  tenantContext.role === "owner"
                    ? "default"
                    : tenantContext.role === "admin"
                      ? "secondary"
                      : "outline"
                }
              >
                <ShieldCheckIcon data-icon="inline-start" />
                {roleLabel(tenantContext.role)}
              </Badge>
            </div>

            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">ID da organizacao</p>
              <code className="bg-muted/50 inline-flex w-full items-center gap-2 rounded-md border px-2 py-1 text-[0.625rem] font-medium">
                <Building2Icon className="size-3" />
                {tenantContext.organizationId}
              </code>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppPageContainer>
  );
}
