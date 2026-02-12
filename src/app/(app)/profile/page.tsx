import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Building2Icon, ShieldCheckIcon } from "lucide-react";
import Image from "next/image";

import { AppPageContainer } from "@/components/app/app-page-container";
import { ProfileForm } from "@/components/auth/profile-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrganizationUserRole } from "@/lib/organization/helpers";
import { getTenantContext } from "@/lib/organization/tenant-context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Perfil",
  description:
    "Atualize dados da conta, seguranca e identidade do usuario no workspace do avocado SaaS Starter.",
  alternates: {
    canonical: "/profile",
  },
};

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
  const initialImage = ((user as { image?: string | null }).image ?? "").trim() || null;

  return (
    <AppPageContainer className="gap-6">
      <section className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Perfil</h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Atualize identidade, credenciais e seguranca com fluxo claro por bloco.
        </p>
      </section>

      <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-background via-background to-primary/10">
        <CardContent className="p-0">
          <div className="grid items-center gap-4 md:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-2 px-5 py-5 sm:px-6">
              <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.12em]">
                Identidade em dia
              </p>
              <h2 className="text-xl font-semibold tracking-tight">
                Seu perfil organizado para manter seguranca e confianca
              </h2>
              <p className="text-muted-foreground text-sm">
                Atualize foto, credenciais e protecao da conta em um fluxo simples e consistente.
              </p>
            </div>

            <div className="relative h-48 w-full md:h-full md:min-h-[220px]">
              <Image
                src="/img/profile.png"
                alt="Avocado gerenciando perfil no computador"
                fill
                priority
                sizes="(max-width: 768px) 100vw, 34vw"
                className="object-cover object-center md:object-[56%_center]"
              />
            </div>
          </div>
        </CardContent>
      </Card>

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
