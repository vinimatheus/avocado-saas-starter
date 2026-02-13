import type { Metadata } from "next";
import {
  BoxesIcon,
  Clock3Icon,
  MailPlusIcon,
  UserCheck2Icon,
  UsersIcon,
} from "lucide-react";
import Image from "next/image";

import { AppPageContainer } from "@/components/app/app-page-container";
import { DashboardAreaCharts } from "@/components/dashboard/dashboard-area-charts";
import { StatusBanner } from "@/components/app/status-banner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardInsights } from "@/lib/dashboard/analytics";
import { getTenantContext } from "@/lib/organization/tenant-context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Painel",
  description: "Painel interno para acompanhar usuarios, equipe, produtos e sinais operacionais.",
  alternates: {
    canonical: "/dashboard",
  },
};

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

export default async function DashboardPage() {
  const tenantContext = await getTenantContext();
  const insights = await getDashboardInsights(tenantContext.organizationId!);

  return (
    <AppPageContainer className="gap-6">
      <section className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Painel</h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Acompanhe tendencia mensal de usuarios, equipe e produtos em um unico painel.
        </p>
      </section>

      <StatusBanner message={insights.errorMessage} />

      <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-background via-background to-primary/10">
        <CardContent className="p-0">
          <div className="grid items-center gap-4 md:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-2 px-5 py-5 sm:px-6">
              <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.12em]">
                avocado no controle
              </p>
              <h2 className="text-xl font-semibold tracking-tight">
                Seu painel com visao clara para decidir mais rapido
              </h2>
              <p className="text-muted-foreground text-sm">
                Acompanhe usuarios, time e produtos em um unico lugar e mantenha sua operacao
                evoluindo com previsibilidade.
              </p>
            </div>

            <div className="relative h-48 w-full md:h-full md:min-h-[220px]">
              <Image
                src="/img/dashboard.png"
                alt="avocado mexendo no computador"
                fill
                priority
                sizes="(max-width: 768px) 100vw, 34vw"
                className="object-cover object-center md:object-[58%_center]"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <UsersIcon className="size-3.5" />
              Usuarios ativos
            </CardDescription>
            <CardTitle className="text-2xl">{insights.memberCount}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <MailPlusIcon className="size-3.5" />
              Convites pendentes
            </CardDescription>
            <CardTitle className="text-2xl">{insights.pendingInvitationCount}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <BoxesIcon className="size-3.5" />
              Produtos cadastrados
            </CardDescription>
            <CardTitle className="text-2xl">{insights.productCount}</CardTitle>
            <p className="text-muted-foreground text-xs">
              <UserCheck2Icon className="mr-1 inline size-3" />
              Ativos: {insights.productActiveCount}
            </p>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Clock3Icon className="size-3.5" />
              Ultima atualizacao
            </CardDescription>
            <CardTitle className="text-base">{formatDate(new Date())}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <DashboardAreaCharts data={insights.chartData} />
    </AppPageContainer>
  );
}
