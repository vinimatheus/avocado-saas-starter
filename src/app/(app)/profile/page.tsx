import { redirect } from "next/navigation";
import { Building2Icon, ShieldCheckIcon, UserCogIcon } from "lucide-react";

import { AppPageHero } from "@/components/app/app-page-hero";
import { AppPageContainer } from "@/components/app/app-page-container";
import { ProfileForm } from "@/components/auth/profile-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrganizationUserRole } from "@/lib/organization/helpers";
import { getTenantContext } from "@/lib/organization/tenant-context";

export const dynamic = "force-dynamic";
const DEFAULT_AVATAR_IMAGE = "/img/avatar.png";

function roleLabel(role: OrganizationUserRole | null): string {
  if (role === "owner") {
    return "Owner";
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

  const initialTwoFactorEnabled = Boolean((user as { twoFactorEnabled?: boolean }).twoFactorEnabled);
  const initialImage = (user as { image?: string | null }).image?.trim() || DEFAULT_AVATAR_IMAGE;

  return (
    <AppPageContainer className="gap-6">
      <AppPageHero
        icon={UserCogIcon}
        eyebrow="Profile"
        title="Central da sua conta"
        description="Atualize identidade, credenciais e seguranca com fluxo claro por bloco."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <ProfileForm
          initialName={user.name}
          initialEmail={user.email}
          initialImage={initialImage}
          initialTwoFactorEnabled={initialTwoFactorEnabled}
        />

        <Card className="h-fit lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle>Resumo da conta</CardTitle>
            <CardDescription>Status rapido da organizacao e do seu acesso atual.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">Empresa ativa</p>
              <p className="text-sm font-medium">
                {tenantContext.organizationName || "Empresa nao identificada"}
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
              <p className="text-muted-foreground text-xs">Workspace</p>
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
